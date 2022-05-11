import React, {useEffect, useRef, useState} from "react"
import {useAppVisible} from "./utils"
import logo from "./logo.svg"
import "./App.css"
import {getUserAuthToken, syncHighlights, baseURL} from "./main"

function App() {
    const innerRef = useRef<HTMLDivElement>(null)
    const visible = useAppVisible()
    const [accessToken, setAccessToken] = useState(logseq.settings!.readwiseAccessToken)
    const [isLoadAuto, setIsLoadAuto] = useState(logseq.settings!.isLoadAuto)
    const [isResyncDeleted, setIsResyncDeleted] = useState(logseq.settings!.isResyncDeleted)

    const onClickOutside = () => window.logseq.hideMainUI()

    async function connectToReadwise() {
        const accessToken = await getUserAuthToken()
        if (accessToken !== undefined) {
            logseq.updateSettings({
                readwiseAccessToken: accessToken
            })
            setAccessToken(accessToken)
            console.log("Access token saved")
        }
    }

    async function initiateSync() {
        if (logseq.settings!.isSyncing) {
            logseq.App.showMsg("Readwise sync already in progress", "warning")
        } else {
            await syncHighlights(false)
        }
    }

    function openPreferences() {
        window.open(`${baseURL}/export/logseq/preferences`)
    }

    useEffect(() => {
        // @ts-expect-error
        const handleClickOutside = (event) => {
            if (innerRef.current && !innerRef.current.contains(event.target)) {
                onClickOutside()
            }
        }
        document.addEventListener("click", handleClickOutside, true)
        return () => {
            document.removeEventListener("click", handleClickOutside, true)
        }
    }, [])

    if (visible) {
        return (
            <div ref={innerRef} className="flex justify-center border border-black">
                <div className="absolute top-1/3 bg-white rounded-sm p-3 w-2/5 border">
                    <div className="flex place-content-between">
                        <img src={logo} className="h-5" alt="readwise logo"/>
                        <button type="button" onClick={() => window.logseq.hideMainUI()}>
                            x
                        </button>
                    </div>
                    <hr className="w-full mt-3 mb-3"/>
                    {!accessToken && (
                        <div className="mt-1 flex justify-between">
                            <div className="text-m text-gray-700">
                                Connect Logseq to Readwise
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    The Readwise plugin enables automatic syncing of all your
                                    highlights from Kindle, Instapaper, Pocket, and more. Note:
                                    Requires Readwise account.
                                </p>
                            </div>
                            <div className="self-center mr-1">
                                <button onClick={connectToReadwise}
                                        type="button"
                                        className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 text-center mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">
                                    Connect
                                </button>
                            </div>
                        </div>
                    )}
                    {accessToken && (
                        <>
                            <div className="mt-1">
                                <div className="mt-1 mb-4 flex justify-between">
                                    <div className="text-m text-gray-700 w-2/3">
                                        Sync your Readwise data with Logseq
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            On first sync, the Readwise plugin will create a new page named Readwise
                                        </p>
                                    </div>
                                    <div className="self-center mr-1 mt-1">
                                        <button onClick={initiateSync}
                                                type="button"
                                                className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 text-center mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">
                                            Initiate Sync
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1 mb-4 flex justify-between">
                                    <div className="text-m text-gray-700 w-2/3">
                                        Customize formatting options
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            You can customize which items export to Logseq and how they appear from the Readwise website
                                        </p>
                                    </div>
                                    <div className="self-center mr-1 mt-1">
                                        <button onClick={openPreferences}
                                                type="button"
                                                className="py-2.5 px-5 mr-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700">
                                            Customize
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1 mb-4 flex justify-between">
                                    <div>
                                        <label htmlFor="isLoadAuto" className="text-m text-gray-700">
                                            Sync automatically when Logseq opens
                                        </label>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            If enabled, Readwise will automatically resync with Logseq each
                                            time you open the app
                                        </p>
                                    </div>
                                    <div
                                        className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input
                                            type="checkbox"
                                            name="isLoadAuto"
                                            id="isLoadAuto"
                                            defaultChecked={isLoadAuto}
                                            onChange={() => {
                                                setIsLoadAuto(!isLoadAuto)
                                                logseq.updateSettings({
                                                    isLoadAuto: !isLoadAuto
                                                })
                                            }}
                                            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                        />
                                        <label
                                            htmlFor="isLoadAuto"
                                            className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                                        ></label>
                                    </div>
                                </div>
                                <div className="mt-1 mb-4 flex justify-between">
                                    <div>
                                        <label htmlFor="isResyncDeleted" className="text-m text-gray-700">
                                            Resync deleted pages
                                        </label>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            If enabled, you can refresh individual items by deleting the file
                                            in Logseq and initiating a resync
                                        </p>
                                    </div>
                                    <div
                                        className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input
                                            type="checkbox"
                                            name="isResyncDeleted"
                                            id="isResyncDeleted"
                                            defaultChecked={isResyncDeleted}
                                            onChange={() => {
                                                setIsResyncDeleted(!isResyncDeleted)
                                                logseq.updateSettings({
                                                    isResyncDeleted: !isResyncDeleted
                                                })
                                            }}
                                            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                        />
                                        <label
                                            htmlFor="isResyncDeleted"
                                            className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                                        ></label>
                                    </div>
                                </div>
                            </div>

                        </>
                    )}
                </div>
            </div>
        )
    }
    return null
}

export default App
