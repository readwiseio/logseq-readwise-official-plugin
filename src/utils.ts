import React, {useState} from "react";
import {useMountedState} from "react-use";

export const triggerIconName = "logseq-readwise-trigger-icon";

export const useAppVisible = () => {
    const [visible, setVisible] = useState(logseq.isMainUIVisible);
    const isMounted = useMountedState();
    React.useEffect(() => {
        const eventName = "ui:visible:changed";
        const handler = async ({visible}: any) => {
            if (isMounted()) {
                setVisible(visible);
            }
        };
        logseq.on(eventName, handler);
        return () => {
            logseq.off(eventName, handler);
        };
    }, []);
    return visible;
};