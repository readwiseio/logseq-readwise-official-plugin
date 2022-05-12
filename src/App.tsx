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
    const [notification, setNotification] = useState(null)
    const [isSyncing, setIsSyncing] = useState(false)

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
        setIsSyncing(true)
        if (isSyncing) {
            logseq.App.showMsg("Readwise sync already in progress", "warning")
        } else {
            await syncHighlights(false, setNotification, setIsSyncing)
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
                <div className="absolute top-1/3 bg-white p-3 w-2/5 border">
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
                                                type="button" disabled={isSyncing}
                                                className={`text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 text-center mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 ${isSyncing ? 'button-disabled' : ''}`}>
                                            Initiate Sync
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-1 mb-4 flex justify-between">
                                    <div className="text-m text-gray-700 w-2/3">
                                        Customize formatting options
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            You can customize which items export to Logseq and how they appear from the
                                            Readwise website
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
                    <div>
                        <span className="text-sm text-gray-500">
                            {notification && (
                                <>
                                    <svg role="status"
                                         className="inline w-6 h-6 mr-2 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
                                         viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                                            fill="currentColor"/>
                                        <path
                                            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                                            fill="currentFill"/>
                                    </svg>
                                    {notification}
                                </>
                            )}
                        </span>
                    </div>
                </div>
            </div>
        )
    }
    return null
}

export default App
