import "@logseq/libs"
import "virtual:windi.css"

import React from "react"
import App from "./App"
import Font from "./icomoon.woff";
import {format} from 'date-fns'

import {logseq as PL} from "../package.json"
import {triggerIconName} from "./utils"
import {IBatchBlock, PageEntity, SettingSchemaDesc} from "@logseq/libs/dist/LSPlugin"
import {createRoot} from "react-dom/client";

// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args)
const magicKey = `__${PL.id}__loaded__`
// @ts-ignore
const partial = (func, ...args) => (...rest) => func(...args, ...rest);

export const isDev = process.env.NODE_ENV === "development"
export const baseURL = isDev ? "https://local.readwise.io:8000" : "https://readwise.io"
export const parentPageName = "Readwise"

interface ReadwiseBlock {
    string: string,
    children?: Array<ReadwiseBlock>
}

interface ExportRequestResponse {
    latest_id: number,
    status: string
}

interface ExportStatusResponse {
    totalBooks: number,
    booksExported: number,
    isFinished: boolean,
    taskStatus: string,
}

function getLogseqClientID() {
    let clientId = window.localStorage.getItem('rw-LogseqClientId')
    if (clientId) {
        return clientId
    } else {
        clientId = Math.random().toString(36).substring(2, 15)
        window.localStorage.setItem('rw-LogseqClientId', clientId)
        return clientId
    }
}

// @ts-ignore
export async function getUserAuthToken(attempt = 0) {
    const uuid = getLogseqClientID()
    if (attempt === 0) {
        window.open(`${baseURL}/api_auth?token=${uuid}&service=logseq`)
    }
    await new Promise(r => setTimeout(r, 2000)) // wait until have data on cache
    let response, data
    try {
        response = await window.fetch(
            `${baseURL}/api/auth?token=${uuid}`
        )
    } catch (e) {
        console.log("Readwise Official plugin: fetch failed in getUserAuthToken: ", e)
    }
    if (response && response.ok) {
        data = await response.json()
    } else {
        console.log("Readwise Official plugin: bad response in getUserAuthToken: ", response)
        logseq.App.showMsg('Authorization failed. Try again', 'warning')
        return
    }
    if (data.userAccessToken) {
        return data.userAccessToken
    } else {
        if (attempt > 20) {
            console.log('Readwise Official plugin: reached attempt limit in getUserAuthToken')
            return
        }
        console.log(`Readwise Official plugin: didn't get token data, retrying (attempt ${attempt + 1})`)
        await new Promise(r => setTimeout(r, 1000))
        return await getUserAuthToken(attempt + 1)
    }
}

function processBlockContent(content: string, preferredDateFormat: string) {
    const reg = new RegExp(/timestamp:\|([0-9]+)\|/i)
    if (content !== undefined) {
        return content.replace(reg, function (match, timestamp) {
            try {
                return format(new Date(parseInt(timestamp)), preferredDateFormat)
            } catch (e) {
                return ""
            }

        })
    } else {
        return content
    }
}

function convertReadwiseToIBatchBlock(preferredDateFormat: string, obj: ReadwiseBlock) {
    // we ignore the first one (which we can consider as the block title)
    const block: IBatchBlock = {
        content: processBlockContent(obj.string, preferredDateFormat)!,
    }
    if (obj.children !== undefined) {
        block.children = obj.children.map(partial(convertReadwiseToIBatchBlock, preferredDateFormat)).filter(
            (b): b is IBatchBlock => b !== undefined
        )
    }
    return block
}

async function createPage(title: string, blocks: Array<IBatchBlock>) {
    const page = await logseq.Editor.createPage(title, {'title': title}, {
        createFirstBlock: false,
        redirect: false
    })
    await new Promise(r => setTimeout(r, 500))
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(title)
    if (pageBlocksTree !== null && pageBlocksTree.length === 0) {
        // the correct flow because we are using createFirstBlock: false
        const firstBlock = await logseq.Editor.insertBlock(page!.originalName, blocks[0].content, {
            before: false,
            isPageBlock: true
        })
        await logseq.Editor.insertBatchBlock(firstBlock!.uuid, blocks.slice(1), {sibling: true})
        return true
    } else if (pageBlocksTree !== null && pageBlocksTree.length === 1) {
        // createFirstBlock: false creates a block to title if the name contains invalid characters
        const _first = pageBlocksTree[0]
        await logseq.Editor.updateBlock(_first!.uuid, _first.content + "\n" + blocks[0].content)
        await logseq.Editor.insertBatchBlock(_first!.uuid, blocks.slice(1), {sibling: true})
        return true
    }
    logseq.App.showMsg(`Error creating "${title}", page not created`, "warning")
    return false
}


async function updatePage(page: PageEntity, blocks: Array<IBatchBlock>) {
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(page.originalName)
    // uuid isn't working: https://github.com/logseq/logseq/issues/4920
    await new Promise(r => setTimeout(r, 500))
    if (pageBlocksTree.length === 0) {
        const firstBlock = await logseq.Editor.insertBlock(page!.originalName, blocks[0].content, {
            before: false,
            isPageBlock: true
        })
        await logseq.Editor.insertBatchBlock(firstBlock!.uuid, blocks.slice(1), {sibling: true})
    } else if (pageBlocksTree.length > 0) {
        const _last = pageBlocksTree[pageBlocksTree.length - 1]
        await logseq.Editor.insertBatchBlock(_last!.uuid, blocks, {sibling: true})
    } else {
        logseq.App.showMsg(`Error updating "${page.originalName}", page not loaded`, "error")
    }
}

function getErrorMessageFromResponse(response: Response) {
    if (response && response.status === 409) {
        return "Sync in progress initiated by different client"
    }
    if (response && response.status === 417) {
        return "Logseq export is locked. Wait for an hour."
    }
    return `${response ? response.statusText : "Can't connect to server"}`
}

function getAuthHeaders() {
    return {
        'AUTHORIZATION': `Token ${logseq.settings!.readwiseAccessToken}`,
        'Logseq-Client': `${getLogseqClientID()}`
    }
}

function handleSyncError(notificationCallback: () => void) {
    clearSettingsAfterRun()
    logseq.updateSettings({
        lastSyncFailed: true
    })
    notificationCallback()
}

function clearSettingsAfterRun() {
    logseq.updateSettings({
        currentSyncStatusID: 0
    })
}

export function clearSettingsComplete() {
    logseq.updateSettings({
        currentSyncStatusID: 0,
        lastSyncFailed: false,
        lastSavedStatusID: 0,
        booksIDsMap: null,
        readwiseAccessToken: null,
        isLoadAuto: true,
        isResyncDeleted: false,
        currentGraph: null
    })
}

function handleSyncSuccess(msg = "Synced", exportID?: number) {
    clearSettingsAfterRun()
    logseq.updateSettings({
        lastSyncFailed: false,
        currentSyncStatusID: 0
    })
    if (exportID) {
        logseq.updateSettings({
            lastSavedStatusID: exportID
        })
    }
    logseq.App.showMsg(msg)
}

type BookToExport = [number, string]

async function refreshBookExport(books: Array<BookToExport>) {
    let response, bookIds: number[]
    if (books.length > 0) {
        try {
            bookIds = books.map((b) => b[0])
            response = await window.fetch(
                `${baseURL}/api/refresh_book_export`, {
                    headers: {...getAuthHeaders(), 'Content-Type': 'application/json'},
                    method: "POST",
                    body: JSON.stringify({exportTarget: 'logseq', books: bookIds})
                }
            )
        } catch (e) {
            console.log("Readwise Official plugin: fetch failed in refreshBookExport: ", e);
        }
        if (response && response.ok) {
            const booksIDsMap = logseq.settings!.booksIDsMap || {}
            const booksIDsMapAsArray = Object.entries(booksIDsMap)
            logseq.updateSettings({
                // @ts-ignore
                booksIDsMap: Object.fromEntries(booksIDsMapAsArray.filter((b) => !(b[1] in bookIds)))
            })
        }
    } else {
        console.log("Skipping refresh, no books")
    }
}

async function acknowledgeSyncCompleted() {
    let response
    try {
        response = await window.fetch(
            `${baseURL}/api/logseq/sync_ack`,
            {
                headers: {...getAuthHeaders(), 'Content-Type': 'application/json'},
                method: "POST",
            })
    } catch (e) {
        console.log("Readwise Official plugin: fetch failed to acknowledged sync: ", e)
    }
    if (response && response.ok) {
        return
    } else {
        console.log("Readwise Official plugin: bad response in acknowledge sync: ", response)
        logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
        return
    }
}

// @ts-ignore
export async function removeDocuments(documentsToRemove: Array<string>, setNotification?, setIsResetting?) {
    setIsResetting(true)
    for (const docTitle of documentsToRemove) {
        await logseq.Editor.deletePage(docTitle)
        setNotification(`Deleting ${docTitle}`)
    }
    setNotification(null)
    setIsResetting(false)
    await logseq.Editor.deletePage("Readwise")
}

// @ts-ignore
async function downloadArchive(exportID: number, setNotification?, setIsSyncing?, auto?): Promise<void> {
    const artifactURL = `${baseURL}/api/download_artifact/${exportID}`
    if (exportID <= logseq.settings!.lastSavedStatusID) {
        console.log(`Readwise Official plugin: Already saved data from export ${exportID}`)
        handleSyncSuccess()
        logseq.App.showMsg("Readwise data is already up to date")
        setIsSyncing(false)
        return
    }

    let response
    try {
        response = await window.fetch(
            artifactURL, {headers: getAuthHeaders()}
        )
    } catch (e) {
        console.log("Readwise Official plugin: fetch failed in downloadArchive: ", e)
        setIsSyncing(false)
    }
    const booksIDsMap = logseq.settings!.booksIDsMap || {}
    const preferredDateFormat = (await logseq.App.getUserConfigs()).preferredDateFormat
    if (response && response.ok) {
        const responseJSON = await response.json()
        const books = responseJSON.books
        if (books.length) {
            setNotification("Saving pages...")
            for (const [index, book] of books.entries()) {
                const bookId = book.userBookExportId
                const bookIsUpdate = book.isUpdate
                const bookData = book.data
                booksIDsMap[bookData.title] = bookId
                const page = await logseq.Editor.getPage(bookData.title)
                // @ts-ignore
                if (window.onAnotherGraph) {
                    setIsSyncing(false)
                    setNotification(null)
                    handleSyncError(() => {
                        const msg = `Graph changed during sync, please return to graph "${logseq.settings!.currentGraph.name}" to complete the sync`
                        if (!auto) {
                            logseq.App.showMsg(msg, "error")
                        } else {
                            console.log(msg)
                        }
                    })
                    return
                }
                if (page !== null) {
                    // page exists
                    if (bookIsUpdate) {
                        const convertedUpdateBook = convertReadwiseToIBatchBlock(preferredDateFormat, bookData)
                        if (convertedUpdateBook !== undefined) {
                            await updatePage(page, convertedUpdateBook!.children!)
                            setNotification(`Updating "${bookData.title}" completed (${index}/${books.length})`)
                        }
                    } else {
                        // trying to updating a book but during a full resync (the page already exists)
                        setNotification(`Skipping "${bookData.title}", page already exists (${index}/${books.length})`)
                    }

                } else {
                    const convertedNewBook = convertReadwiseToIBatchBlock(preferredDateFormat, bookData)
                    if (convertedNewBook !== undefined) {
                        const created = await createPage(bookData.title, convertedNewBook!.children!)
                        if (created) {
                            setNotification(`Creating "${bookData.title}" completed (${index}/${books.length})`)
                        }
                    }
                }
            }
            const readwisePage = await logseq.Editor.getPage(parentPageName)
            if (readwisePage === null) {
                await logseq.Editor.createPage(parentPageName, {'title': parentPageName}, {
                    createFirstBlock: false,
                    redirect: false
                })
            }
            if (readwisePage && responseJSON.syncNotification) {
                console.log(`Updating ${parentPageName} page with sync notification`)
                await updatePage(readwisePage, convertReadwiseToIBatchBlock(
                    preferredDateFormat, responseJSON.syncNotification!
                ).children!)
            }
        }
        logseq.updateSettings({
            booksIDsMap: booksIDsMap
        })
        setIsSyncing(false)
        setNotification(null)
    } else {
        setIsSyncing(false)
        setNotification(null)
        console.log("Readwise Official plugin: bad response in downloadArchive: ", response)
        logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
        return
    }

    await acknowledgeSyncCompleted()
    handleSyncSuccess("Synced!", exportID)
    logseq.App.showMsg("Readwise sync completed")
    setIsSyncing(false)
    setNotification(null)
}

// @ts-ignore
async function getExportStatus(statusID?: number, setNotification?, setIsSyncing?, auto?) {
    const statusId = statusID || logseq.settings!.currentSyncStatusID
    const url = `${baseURL}/api/get_export_status?exportStatusId=${statusId}`
    let response, data: ExportStatusResponse
    try {
        response = await window.fetch(
            url,
            {
                headers: getAuthHeaders()
            }
        )
    } catch (e) {
        console.log("Readwise Official plugin: fetch failed in getExportStatus: ", e)
    }
    if (response && response.ok) {
        data = await response.json()
    } else {
        console.log("Readwise Official plugin: bad response in getExportStatus: ", response)
        logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
        return
    }
    const WAITING_STATUSES = ['PENDING', 'RECEIVED', 'STARTED', 'RETRY']
    const SUCCESS_STATUSES = ['SUCCESS']
    if (WAITING_STATUSES.includes(data.taskStatus)) {
        if (data.booksExported) {
            setNotification(`Exporting Readwise data (${data.booksExported} / ${data.totalBooks}) ...`)
        } else {
            setNotification("Building export...")
        }
        // re-try in 2 secs
        await new Promise(r => setTimeout(r, 2000))
        await getExportStatus(statusId, setNotification, setIsSyncing, auto)
    } else if (SUCCESS_STATUSES.includes(data.taskStatus)) {
        setNotification(null)
        return downloadArchive(statusId, setNotification, setIsSyncing, auto)
    } else {
        setNotification(null)
        setIsSyncing(false)
        handleSyncError(() => {
                const msg = 'Sync failed'
                if (!auto) {
                    logseq.App.showMsg(msg, "error")
                } else {
                    console.log(msg)
                }
            }
        )
    }
    setNotification(null)
    setIsSyncing(false)
}

function configureSchedule() {
    checkForCurrentGraph()
    // @ts-ignore
    const onAnotherGraph = window.onAnotherGraph
    if (logseq.settings!.readwiseAccessToken && logseq.settings!.frequency) {
        if (!onAnotherGraph) {
            const frequency = parseInt(logseq.settings!.frequency)
            if (!isNaN(frequency) && frequency > 0) {
                const milliseconds = frequency * 60 * 1000
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                window.setInterval(() => syncHighlights(true, console.log, () => {
                }).then(() => console.log('Auto sync loaded.')), milliseconds)
            } else {
                // setting the default value on settings, for previous values
                logseq.updateSettings({
                    frequency: "60",
                })
            }

        }
    }
}


function resyncDeleted(callback: (() => void)) {
    checkForCurrentGraph()
    // @ts-ignore
    const onAnotherGraph = window.onAnotherGraph
    if (logseq.settings!.readwiseAccessToken && logseq.settings!.isResyncDeleted) {
        if (!onAnotherGraph) {
            (new Promise(r => setTimeout(r, 2000))).then(() => {
                    const booksIDsMap = logseq.settings!.booksIDsMap || {}
                    // @ts-ignore
                    Promise.all(Object.keys(booksIDsMap).map((bookName) => {
                        return new Promise((resolve) => {
                            logseq.Editor.getPage(bookName).then((res) => {
                                if (res === null) {
                                    resolve(([booksIDsMap[bookName], bookName]))
                                    console.log(`Page '${bookName}' deleted, going to resync.`)
                                } else {
                                    resolve(null)
                                }
                            })
                        })
                    })).then(r => {
                        // @ts-ignore
                        refreshBookExport(r.filter(b => b !== null)).then(() => {
                            console.log('Resync deleted done.')
                        })
                    })

                }
            )
        }
    }
    (new Promise(r => setTimeout(r, 2000))).then(() => {
            callback()
        }
    )
}

// @ts-ignore
export async function syncHighlights(auto?: boolean, setNotification?, setIsSyncing?) {
    resyncDeleted(async () => {
        setNotification("Starting sync...")
        let url = `${baseURL}/api/logseq/init?auto=${auto}`
        if (auto) {
            await new Promise(r => setTimeout(r, 2000))
        }
        const isForceCompleteSync = logseq.settings!.lastSyncFailed
        const parentDeleted = await logseq.Editor.getPage(parentPageName) === null || isForceCompleteSync
        if (parentDeleted) {
            url += `&parentPageDeleted=${parentDeleted}`
        }
        let response, data: ExportRequestResponse
        try {
            response = await window.fetch(
                url,
                {
                    headers: getAuthHeaders()
                }
            )
        } catch (e) {
            console.log("Readwise Official plugin: fetch failed in requestArchive: ", e)
        }
        if (response && response.ok) {
            data = await response.json()
            if (data.latest_id <= logseq.settings!.lastSavedStatusID) {
                handleSyncSuccess()
                logseq.App.showMsg("Readwise data is already up to date")
                setIsSyncing(false)
                setNotification(null)
                return
            }
            logseq.updateSettings({
                currentSyncStatusID: data.latest_id
            })
            if (response.status === 201) {
                logseq.App.showMsg("Syncing Readwise data")
                return getExportStatus(data.latest_id, setNotification, setIsSyncing, auto)
            } else {
                setIsSyncing(false)
                setNotification(null)
                handleSyncSuccess("Synced", data.latest_id)
                logseq.App.showMsg("Latest Readwise sync already happened on your other device. Data should be up to date")
            }
        } else {
            console.log("Readwise Official plugin: bad response in requestArchive: ", response)
            logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
            setIsSyncing(false)
            setNotification(null)
            return
        }
        setIsSyncing(false)
        setNotification(null)
    })
}

export function checkForCurrentGraph() {
    window.logseq.App.getCurrentGraph().then((currentGraph) => {
        // @ts-ignore
        window.onAnotherGraph = !!(logseq.settings!.currentGraph && currentGraph?.url !== logseq.settings!.currentGraph.url);
    })
}

function main() {
    const schema: Array<SettingSchemaDesc> = [
        {
            key: "isLoadAuto",
            type: "boolean",
            default: true,
            title: "Sync automatically when Logseq opens",
            description: "If enabled, Readwise will automatically resync with Logseq each time you open the app",
        },
        {
            key: "isResyncDeleted",
            type: "boolean",
            default: false,
            title: "Resync deleted pages",
            description: "If enabled, you can refresh individual items by deleting the page in Logseq and initiating a resync",
        },
        {
            key: "frequency",
            type: "enum",
            enumChoices: ["15", "30", "60", "90"],
            enumPicker: "select",
            default: "60",
            title: "Resync frequency",
            description: "Readwise will automatically resync with Logseq when the app is open at the specified interval (in minutes)",
        }
    ]
    logseq.useSettingsSchema(schema)
    const pluginId = logseq.baseInfo.id
    console.info(`#${pluginId}: MAIN`)
    const container = document.getElementById('app')
    const root = createRoot(container!)
    root.render(
        <React.StrictMode>
            <App/>
        </React.StrictMode>
    )

    function createModel() {
        return {
            async show() {
                logseq.showMainUI()
            },
        }
    }

    logseq.provideModel(createModel())
    logseq.setMainUIInlineStyle({
        zIndex: 11,
    })

    if (isDev) {
        // @ts-expect-error
        top[magicKey] = true
    }
    logseq.provideStyle(css`
      @font-face {
        font-family: 'readwise';
        src: url(${Font}) format('woff');
        font-weight: normal;
        font-style: normal;
        font-display: block;
      }

      [class^="rw-"], [class*=" rw-"] {
        font-family: 'readwise' !important;
        speak: never;
        font-style: normal;
        font-weight: normal;
        font-variant: normal;
        text-transform: none;
        line-height: 1;
        -webkit-font-smoothing: antialiased;
      }

      .${triggerIconName} {
        font-size: 20px;
      }

      .${triggerIconName}:before {
        content: "\e900";
      }
    `)

    logseq.App.registerUIItem("toolbar", {
        key: "readwise-plugin-open",
        template: `
          <a data-on-click="show" title="Readwise" class="button">
            <span class="${triggerIconName}">
            </span>
          </a>
        `,
    })

    if (logseq.settings!.currentSyncStatusID !== 0) {
        logseq.updateSettings({
            lastSyncFailed: true,
            currentSyncStatusID: 0
        })
    }


    // check current state
    if (logseq.settings!.readwiseAccessToken && logseq.settings!.currentSyncStatusID !== 0) {
        // the last sync didn't finish correctly (initial phase)
        (new Promise(r => setTimeout(r, 1000))).then(() => {
                logseq.App.showMsg("Readwise sync didn't finish correctly, please start a new sync again", "warning")
            }
        )
    }
    checkForCurrentGraph()
    window.logseq.App.onCurrentGraphChanged(() => {
        checkForCurrentGraph()
    })
    // @ts-ignore
    const onAnotherGraph = window.onAnotherGraph
    // first we check for deleted
    resyncDeleted(() => {
        // next we auto sync
        if (logseq.settings!.readwiseAccessToken && logseq.settings!.isLoadAuto) {
            if (!onAnotherGraph && logseq.settings!.currentSyncStatusID === 0) {
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                syncHighlights(true, console.log, () => {
                }).then(() => console.log('Auto sync loaded.'))
            }
        }
    })
    // we set an interval
    configureSchedule()
}

// @ts-expect-error
if (isDev && top[magicKey]) {
    // Currently there is no way to reload plugins
    location.reload()
} else {
    logseq.ready(main).catch(console.error)
}
