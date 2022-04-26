import "@logseq/libs"
import "virtual:windi.css"

import React from "react"
import ReactDOM from "react-dom"
import App from "./App"

import {logseq as PL} from "../package.json"
import {triggerIconName} from "./utils"
import {IBatchBlock, PageEntity, PageIdentity, SettingSchemaDesc} from "@logseq/libs/dist/LSPlugin"

// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args)
const magicKey = `__${PL.id}__loaded__`

const isDev = process.env.NODE_ENV === "development"
const baseURL = isDev ? "https://local.readwise.io:8000" : "https://readwise.io"
const parentPageName = "Readwise"

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


function convertReadwiseToIBatchBlock(obj: ReadwiseBlock) {
    // we ignore the first one (which we can consider as the block title)
    const block: IBatchBlock = {
        content: obj.string,
    }
    if (obj.children !== undefined) {
        block.children = obj.children.map(convertReadwiseToIBatchBlock).filter(
            (b): b is IBatchBlock => b !== undefined
        )
    }
    return block
}

async function createPage(title: string, blocks: Array<IBatchBlock>) {
    const page = await logseq.Editor.createPage(title, {}, {
        createFirstBlock: true,
        redirect: false
    })
    // check if it was correctly created?
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(title)
    await new Promise(r => setTimeout(r, 1000))
    if (pageBlocksTree.length === 1) { // the first one is the property! maybe a bug there?
        const _first = pageBlocksTree[0]
        await logseq.Editor.insertBatchBlock(_first!.uuid, blocks, {sibling: true})
        await logseq.Editor.removeBlock(_first!.uuid)
    } else {
        logseq.App.showMsg(`Error creating "${title}", page not created`, "error")
    }
}


async function updatePage(page: PageEntity, blocks: Array<IBatchBlock>) {
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(page.name)
    // uuid isn't working: https://github.com/logseq/logseq/issues/4920
    if (pageBlocksTree.length > 1) {
        const _last = pageBlocksTree[pageBlocksTree.length - 1]
        await logseq.Editor.insertBatchBlock(_last!.uuid, blocks, {sibling: true})
    } else {
        logseq.App.showMsg(`Error updating "${page.name}", page not loaded`, "error")
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

function handleSyncError(msg: string) {
    clearSettingsAfterRun()
    logseq.updateSettings({
        lastSyncFailed: true
    })
    logseq.App.showMsg(msg, "error")
}

function clearSettingsAfterRun() {
    logseq.updateSettings({
        isSyncing: false,
        currentSyncStatusID: 0
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

async function downloadArchive(exportID: number): Promise<void> {
    const artifactURL = `${baseURL}/api/download_artifact/${exportID}`
    if (exportID <= logseq.settings!.lastSavedStatusID) {
        console.log(`Readwise Official plugin: Already saved data from export ${exportID}`)
        handleSyncSuccess()
        logseq.App.showMsg("Readwise data is already up to date")
        return
    }

    let response
    try {
        response = await window.fetch(
            artifactURL, {headers: getAuthHeaders()}
        )
    } catch (e) {
        console.log("Readwise Official plugin: fetch failed in downloadArchive: ", e)
    }
    const booksIDsMap = logseq.settings!.booksIDsMap || {}
    if (response && response.ok) {
        const responseJSON = await response.json()
        const books = responseJSON.books
        if (books.length) {
            logseq.App.showMsg("Saving pages...")
            for (const book of books) {
                const bookId = book.userBookExportId
                const bookCreate = book.create
                const bookUpdate = book.update
                const page = await logseq.Editor.getPage(bookCreate.title)
                if (page !== null) {
                    // page exists
                    const convertedUpdateBook = convertReadwiseToIBatchBlock(bookUpdate)
                    if (convertedUpdateBook !== undefined) {
                        await updatePage(page, convertedUpdateBook!.children!)
                        logseq.App.showMsg(`Updating "${bookUpdate.title}" completed`)
                    }
                } else {
                    const convertedNewBook = convertReadwiseToIBatchBlock(bookCreate)
                    if (convertedNewBook !== undefined) {
                        await createPage(bookCreate.title, convertedNewBook!.children!)
                        logseq.App.showMsg(`Creating "${bookCreate.title}" completed`)
                        booksIDsMap[bookCreate.title] = bookId
                    }
                }
            }
        }
        logseq.updateSettings({
            booksIDsMap: booksIDsMap
        })
    } else {
        console.log("Readwise Official plugin: bad response in downloadArchive: ", response)
        logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
        return
    }

    await acknowledgeSyncCompleted()
    handleSyncSuccess("Synced!", exportID)
    logseq.App.showMsg("Readwise sync completed")
}

async function getExportStatus(statusID?: number) {
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
            logseq.App.showMsg(`Exporting Readwise data (${data.booksExported} / ${data.totalBooks}) ...`)
        } else {
            logseq.App.showMsg("Building export...")
        }
        // re-try in 2 secs
        await new Promise(r => setTimeout(r, 2000))
        await getExportStatus(statusId)
    } else if (SUCCESS_STATUSES.includes(data.taskStatus)) {
        return downloadArchive(statusId)
    } else {
        handleSyncError("Sync failed")
    }
}

export async function syncHighlights(auto?: boolean) {
    let url = `${baseURL}/api/logseq/init?auto=${auto}`
    if (auto) {
        await new Promise(r => setTimeout(r, 3000))
    }
    const parentDeleted = await logseq.Editor.getPage(parentPageName) === null
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
            return
        }
        logseq.updateSettings({
            currentSyncStatusID: data.latest_id
        })
        if (response.status === 201) {
            logseq.App.showMsg("Syncing Readwise data")
            return getExportStatus(data.latest_id)
        } else {
            handleSyncSuccess("Synced", data.latest_id)
            logseq.App.showMsg("Latest Readwise sync already happened on your other device. Data should be up to date")
        }
    } else {
        console.log("Readwise Official plugin: bad response in requestArchive: ", response)
        logseq.App.showMsg(getErrorMessageFromResponse(response as Response), "error")
        return
    }
}


function main() {
    const schema: Array<SettingSchemaDesc> = [
        {
            key: "isLoadAuto",
            type: "boolean",
            default: false,
            title: "Sync automatically when Logseq opens",
            description: "If enabled, Readwise will automatically resync with Logseq each time you open the app",
        },
        {
            key: "isResyncDeleted",
            type: "boolean",
            default: false,
            title: "Resync deleted pages",
            description: "If enabled, you can refresh individual items by deleting the page in Logseq and initiating a resync",
        }
    ]
    logseq.useSettingsSchema(schema)
    const pluginId = logseq.baseInfo.id
    console.info(`#${pluginId}: MAIN`)
    ReactDOM.render(
        <React.StrictMode>
            <App/>
        </React.StrictMode>,
        document.getElementById("app")
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
      .${triggerIconName} {
        width: 18px;
        height: 18px;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='18px' height='18px' viewBox='0 0 18 18' version='1.1'><rect x='0' y='0' width='18' height='18' style='fill:rgb(0%,0%,0%);fill-opacity:1;stroke:none;'/><path style=' stroke:none;fill-rule:evenodd;fill:rgb(100%,100%,100%);fill-opacity:1;' d='M 14.363281 13.800781 C 13.730469 13.722656 13.417969 13.515625 13.039062 12.882812 L 10.886719 9.382812 C 12.492188 9.113281 13.285156 8.332031 13.285156 6.695312 C 13.285156 4.53125 11.757812 3.914062 8.832031 3.914062 L 3.980469 3.914062 L 3.980469 4.546875 C 4.90625 4.621094 5.089844 4.726562 5.089844 5.597656 L 5.089844 12.75 C 5.089844 13.605469 4.878906 13.726562 3.980469 13.800781 L 3.980469 14.433594 L 8.695312 14.433594 L 8.695312 13.800781 C 7.792969 13.726562 7.582031 13.605469 7.582031 12.75 L 7.582031 9.550781 L 8.3125 9.550781 L 11.238281 14.429688 L 14.363281 14.429688 Z M 10.832031 7.65625 C 10.832031 7.65625 10.453125 5.503906 10.699219 5.050781 L 7.542969 8.546875 C 8.316406 7.90625 10.648438 7.894531 10.648438 7.894531 C 10.761719 7.871094 10.839844 7.769531 10.832031 7.65625 Z M 10.832031 7.65625 '/></svg>");
      }
    `)

    logseq.App.registerUIItem("toolbar", {
        key: "readwise-plugin-open",
        template: `
  <a data-on-click="show">
    <div class="${triggerIconName}">
    </div>
  </a>
`,
    })
    if (logseq.settings!.readwiseAccessToken && logseq.settings!.isLoadAuto) {
        syncHighlights(true).then(() => console.log('Auto sync loaded.'))
    }

    if (logseq.settings!.readwiseAccessToken && logseq.settings!.isResyncDeleted) {
        (new Promise(r => setTimeout(r, 5000))).then(() => {
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
                    });
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

// @ts-expect-error
if (isDev && top[magicKey]) {
    // Currently there is no way to reload plugins
    location.reload()
} else {
    logseq.ready(main).catch(console.error)
}
