let automatic_id = document.getElementById("automatic");
let validTimer_id = document.getElementById("timer_for_tab");
let hours_id = document.getElementById("hours");
let mins_id = document.getElementById("minutes");
let seconds_id = document.getElementById("seconds");
let dashboard_button = document.getElementById("dashboard_button");
let setTime = document.querySelector(".setTime");

let automatic_bool = true;
let timerRunning = false;
let configuredHours = 0;
let configuredMinutes = 1;
let configuredSeconds = 0;
let remainingSeconds = 0;
let timerEndAt = null;
let expiryRequestEndAt = null;
let validTimer_tabs = {};
let currTab_ID = null;

const clamp = (value, min, max) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
};
const getConfiguredTotal = () => {
    return configuredHours * 3600 + configuredMinutes * 60 + configuredSeconds;
};

const asNumberOr = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const renderConfigured = () => {
    hours_id.value = String(configuredHours).padStart(2, "0");
    mins_id.value = String(configuredMinutes).padStart(2, "0");
    seconds_id.value = String(configuredSeconds).padStart(2, "0");
};

const renderRemaining = () => {
    const total = Math.max(0, Number(remainingSeconds) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    hours_id.value = String(hours).padStart(2, "0");
    mins_id.value = String(minutes).padStart(2, "0");
    seconds_id.value = String(seconds).padStart(2, "0");
};

const refreshDisplay = () => {
    if (timerRunning) {
        const liveRemaining = timerEndAt ? Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000)) : remainingSeconds;
        remainingSeconds = liveRemaining;
        renderRemaining();
        if (liveRemaining === 0 && timerEndAt && expiryRequestEndAt !== timerEndAt) {
            expiryRequestEndAt = timerEndAt;
            chrome.runtime.sendMessage({ type: "advance-timer", endAt: timerEndAt }).catch(() => {});
        }
    } else {
        renderConfigured();
    }
};

const updateButtonLabel = () => {
    setTime.textContent = timerRunning ? "Set Time" : "Start Timer";
    setTime.disabled = !automatic_bool && !timerRunning;
};

const updateTimerStatus = async (storedStatus = "") => {
    const tabs = await chrome.tabs.query({});
    const timerStatus = document.getElementById("timerStatus");
    if (!timerStatus) return;

    if (tabs.length <= 5 && timerRunning) {
        const message = "Can't close anymore tabs - at least 5 must remain.";
        timerRunning = false;
        timerEndAt = null;
        remainingSeconds = 0;
        await chrome.storage.local.set({
            timerRunning: false,
            timerPaused: false,
            countdownSeconds: 0,
            timerEndAt: null,
            timerStatus: message
        });
        updateButtonLabel();
        renderConfigured();
        timerStatus.textContent = message;
        timerStatus.classList.remove("hidden");
        return;
    }

    const message = storedStatus;
    timerStatus.textContent = message;
    timerStatus.classList.toggle("hidden", !message);
};

const saveSettings = () => {
    chrome.storage.local.set({
        automatic: automatic_bool,
        hours: configuredHours,
        mins: configuredMinutes,
        seconds: configuredSeconds,
        timerRunning,
        countdownSeconds: Math.max(0, asNumberOr(remainingSeconds, getConfiguredTotal())),
        validTabTimers: validTimer_tabs,
        timerStatus: ""
    });
};

const startTimer = async () => {
    if (!automatic_bool) {
        timerRunning = false;
        updateButtonLabel();
        await updateTimerStatus("Timer stopped");
        return;
    }

    const tabs = await chrome.tabs.query({});
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length <= 5) {
        chrome.storage.local.set({
            timerStatus: "Can't close anymore tabs - at least 5 must remain.",
            timerRunning: false,
            countdownSeconds: 0
        });
        return;
    }

    const startFrom = remainingSeconds > 0 ? remainingSeconds : getConfiguredTotal();
    if (startFrom <= 0) {
        timerRunning = false;
        updateButtonLabel();
        chrome.storage.local.set({
            timerRunning: false,
            timerStatus: "Set a cooldown greater than 0 seconds."
        });
        return;
    }
    const endAt = Date.now() + startFrom * 1000;
    const activeTabId = activeTab?.id ?? currTab_ID;
    timerRunning = true;
    remainingSeconds = startFrom;
    timerEndAt = endAt;
    updateButtonLabel();
    renderRemaining();
    await chrome.storage.local.set({
        automatic: automatic_bool,
        hours: configuredHours,
        mins: configuredMinutes,
        seconds: configuredSeconds,
        timerRunning: true,
        timerPaused: false,
        countdownSeconds: startFrom,
        timerEndAt: endAt,
        activeTabId,
        validTabTimers: validTimer_tabs,
        timerStatus: ""
    });
    chrome.runtime.sendMessage({ type: "start-timer", endAt }).catch(() => {});
};

const stopTimer = () => {
    if (timerEndAt) {
        remainingSeconds = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    }
    timerRunning = false;
    timerEndAt = null;
    updateButtonLabel();
    renderConfigured();
    chrome.storage.local.set({
        automatic: automatic_bool,
        hours: configuredHours,
        mins: configuredMinutes,
        seconds: configuredSeconds,
        timerRunning: false,
        timerPaused: true,
        timerEndAt: null,
        countdownSeconds: Math.max(0, Number(remainingSeconds) || 0),
        validTabTimers: validTimer_tabs,
        timerStatus: ""
    });
};

const SetTime = () => {
    if (timerRunning) {
        stopTimer();
        return;
    }

    startTimer();
};

const syncFromStorage = () => {
    chrome.storage.local.get(["automatic", "hours", "mins", "seconds", "timerRunning", "countdownSeconds", "timerEndAt", "validTabTimers", "timerStatus"], async (result) => {
        automatic_bool = result.automatic !== undefined ? Boolean(result.automatic) : true;
        configuredHours = clamp(result.hours ?? 0, 0, 5);
        configuredMinutes = clamp(result.mins ?? 1, 0, 60);
        configuredSeconds = clamp(result.seconds ?? 0, 0, 60);
        timerRunning = Boolean(result.timerRunning);
        remainingSeconds = Math.max(0, asNumberOr(result.countdownSeconds, getConfiguredTotal()));
        timerEndAt = asNumberOr(result.timerEndAt, null);
        validTimer_tabs = result.validTabTimers ?? {};

        automatic_id.checked = automatic_bool;
        updateButtonLabel();
        refreshDisplay();
        await updateTimerStatus(result.timerStatus || "");
        await initializeValidTimer();
    });
};

const OpenDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
};

dashboard_button.onclick = () => OpenDashboard();
setTime.onclick = () => SetTime();

automatic_id.addEventListener("change", () => {
    automatic_bool = automatic_id.checked;
    saveSettings();
});

[hours_id, mins_id, seconds_id].forEach((input) => {
    input.addEventListener("input", () => {
        if (timerRunning) return;

        configuredHours = clamp(hours_id.value, 0, 5);
        configuredMinutes = clamp(mins_id.value, 0, 60);
        configuredSeconds = clamp(seconds_id.value, 0, 60);

        remainingSeconds = getConfiguredTotal();
        renderConfigured();
        saveSettings();
    });
});

async function getTimerSettings() {
    const result = await chrome.storage.local.get(["automatic", "hours", "mins", "seconds", "timerRunning", "countdownSeconds", "timerEndAt"]);

    return {
        automatic: result.automatic !== undefined ? Boolean(result.automatic) : true,
        hours: Number(result.hours) || 0,
        mins: Number(result.mins) || 0,
        seconds: Number(result.seconds) || 0,
        timerRunning: Boolean(result.timerRunning),
        countdownSeconds: Number(result.countdownSeconds) || 0,
        timerEndAt: asNumberOr(result.timerEndAt, null)
    };
}

async function initializeValidTimer() {
    const result = await chrome.storage.local.get("validTabTimers");
    validTimer_tabs = result.validTabTimers ?? {};
    const tabId = await getCurrentTabId();
    currTab_ID = tabId;

    if (validTimer_tabs[currTab_ID] === undefined) {
        validTimer_tabs[currTab_ID] = true;
        await chrome.storage.local.set({ validTabTimers: validTimer_tabs });
    }

    validTimer_id.checked = Boolean(validTimer_tabs[currTab_ID]);
}

validTimer_id.addEventListener("change", () => {
    if (!currTab_ID) return;
    validTimer_tabs[currTab_ID] = validTimer_id.checked;
    chrome.storage.local.set({ validTabTimers: validTimer_tabs });
});

initializeValidTimer();

async function getCurrentTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.id;
}

chrome.storage.local.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if ("automatic" in changes || "timerRunning" in changes || "countdownSeconds" in changes || "timerEndAt" in changes || "hours" in changes || "mins" in changes || "seconds" in changes || "timerStatus" in changes) {
        configuredHours = clamp(changes.hours?.newValue ?? configuredHours, 0, 5);
        configuredMinutes = clamp(changes.mins?.newValue ?? configuredMinutes, 0, 60);
        configuredSeconds = clamp(changes.seconds?.newValue ?? configuredSeconds, 0, 60);
        timerRunning = Boolean(changes.timerRunning?.newValue ?? timerRunning);
        remainingSeconds = Math.max(0, asNumberOr(changes.countdownSeconds?.newValue ?? remainingSeconds, 0));
        timerEndAt = asNumberOr(changes.timerEndAt?.newValue ?? timerEndAt, null);
        if (timerEndAt !== expiryRequestEndAt) expiryRequestEndAt = null;
        updateButtonLabel();
        refreshDisplay();

        updateTimerStatus(changes.timerStatus?.newValue || "");
    }
});

syncFromStorage();

setInterval(async () => {
    const settings = await getTimerSettings();
    configuredHours = clamp(settings.hours, 0, 5);
    configuredMinutes = clamp(settings.mins ?? 1, 0, 60);
    configuredSeconds = clamp(settings.seconds, 0, 60);
    timerRunning = Boolean(settings.timerRunning);
    remainingSeconds = Math.max(0, asNumberOr(settings.countdownSeconds, 0));
    timerEndAt = settings.timerEndAt;

    updateButtonLabel();
    if (timerRunning) {
        refreshDisplay();
    } else {
        renderConfigured();
    }
    updateTimerStatus();
}, 1000);
