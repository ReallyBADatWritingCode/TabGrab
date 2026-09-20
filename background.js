
const MIN_TABS_TO_KEEP = 5;

const getTotalSeconds = (hours, mins, seconds) => {
  return (Number(hours) || 0) * 3600 + (Number(mins) || 0) * 60 + (Number(seconds) || 0);
};

const asNumberOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getOpenTabCount = async () => {
  const tabs = await chrome.tabs.query({});
  return tabs.length;
};

const getClosableTabs = async () => {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => {
    const url = tab.url || "";
    try {
      const parsedUrl = new URL(url);
      return tab.id && Boolean(parsedUrl.hostname) && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("edge://");
    } catch (_error) {
      return false;
    }
  });
};

const AI_Organize = async (title, url) => {
  const resp = await fetch("https://tabgrab-server.onrender.com/organize", {
    method: "POST",
    headers : {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      title: title,
      url: url,  
    })
  });

  const result = await resp.json();
  return result.folder;

}

const AI_Summarize = async(title, url) => {
  const resp = await fetch("https://tabgrab-server.onrender.com/summarize", {
    method: "POST",
    headers : {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      title: title,
      url: url,  
    })
  });

  const result = await resp.json();
  if (!resp.ok || !result.summary) {
    throw new Error(result.error || `Summary request failed with status ${resp.status}`);
  }
  return result.summary;
}

const notifyTimerStopped = async (message) => {
  try {
    await chrome.notifications.create(`tab-timer-stopped-${Date.now()}`, {
      type: "basic",
      iconUrl: "images/browserIcon.png",
      title: "Tab timer stopped",
      message,
    });
  } catch (error) {
    console.warn("[TabTimer:notification] failed", error);
  }
};

const refreshDashboard = async () => {
  const dashboardUrl = chrome.runtime.getURL("dashboard/dashboard.html");
  const dashboardTabs = await chrome.tabs.query({ url: dashboardUrl });
  await Promise.all(dashboardTabs.map((dashboardTab) => chrome.tabs.reload(dashboardTab.id)));
};

const saveTabToDashboard = async (tab) => {
  const summary = await AI_Summarize(tab.title, tab.url);
  const closedTab = {
    title: tab.title || tab.url,
    url: tab.url,
    icon: tab.favIconUrl,
    id: tab.id,
    summary
  };

  const folderName = await AI_Organize(closedTab.title, closedTab.url);
  const data = await chrome.storage.local.get(["folders", "folderNum"]);
  const folders = data.folders || [];
  let folderNum = Number.isFinite(Number(data.folderNum)) ? Number(data.folderNum) : folders.length;
  const index = folders.findIndex(
    folder => String(folder.name).toLowerCase() === folderName.toLowerCase()
  );

  if (index === -1) {
    folders.push({
      name: folderName,
      icon: "",
      id: String(folderNum),
      tabs: [{ ...closedTab, parent_id: String(folderNum) }],
    });
    folderNum++;
  } else {
    folders[index].tabs = folders[index].tabs || [];
    folders[index].tabs.push({ ...closedTab, parent_id: String(folders[index].id) });
  }

  await chrome.storage.local.set({ folders, folderNum });
  await refreshDashboard();
};

let closeInProgress = false;

const closeNextTab = async (tabId) => {
  if (closeInProgress) return { closed: false, reason: "busy" };
  closeInProgress = true;

  try {
    if (await getOpenTabCount() <= MIN_TABS_TO_KEEP) {
      return { closed: false, reason: "minimum-tabs" };
    }

    const tabs = await getClosableTabs();
    const { validTabTimers = {} } = await chrome.storage.local.get(["validTabTimers"]);
    const eligibleTabs = tabs.filter((tab) => validTabTimers[tab.id] !== false);
    if (eligibleTabs.length === 0) {
      return { closed: false, reason: "all-tabs-excluded" };
    }

    const priorityTab = tabId !== null ? eligibleTabs.find((tab) => tab.id === tabId) : null;
    const orderedTabs = priorityTab
      ? [priorityTab, ...eligibleTabs.filter((tab) => tab.id !== tabId)]
      : eligibleTabs;

    for (const tab of orderedTabs) {
      if (!tab.id || validTabTimers[tab.id] === false) continue;
      try {
        const closedTab = {
          title: tab.title || tab.url,
          url: tab.url,
          icon: tab.favIconUrl,
          id: tab.id,
          savedAt: Date.now(),
          summary: await AI_Summarize(tab.title, tab.url),
        };

        const folderName = await AI_Organize(closedTab.title, closedTab.url);
        const data = await chrome.storage.local.get(["folders", "folderNum"]);
        const folders = data.folders || [];
        let folderNum = Number.isFinite(Number(data.folderNum)) ? Number(data.folderNum) : folders.length;
        const index = folders.findIndex(
          folder => String(folder.name).toLowerCase() === folderName.toLowerCase()
        );

        if (index === -1) {
          folders.push({
            name: folderName,
            icon: "",
            id: String(folderNum),
            tabs: [{ ...closedTab, parent_id: String(folderNum) }],
          });
          folderNum++;
        } else {
          folders[index].tabs = folders[index].tabs || [];
          folders[index].tabs.push({ ...closedTab, parent_id: String(folders[index].id) });
        }

        await chrome.storage.local.set({ folders, folderNum });
        await chrome.tabs.remove(tab.id);
        await refreshDashboard();
        return { closed: true, reason: null };
      } catch (error) {
        console.warn(`[TabTimer:close] failed for tab ${tab.id}`, error);
      }
    }
    return { closed: false, reason: "close-failed" };
  } finally {
    closeInProgress = false;
  }
};

const logTimerState = async (label) => {
  const state = await chrome.storage.local.get(["automatic", "timerRunning", "activeTabId", "countdownSeconds", "tabTimers", "timerStatus"]);
  console.log(`[${label}]`, {
    automatic: state.automatic,
    timerRunning: state.timerRunning,
    activeTabId: state.activeTabId,
    countdownSeconds: state.countdownSeconds,
    timerStatus: state.timerStatus,
    tabTimers: state.tabTimers || []
  });
};

const scheduleTimerAlarm = async (endAt) => {
  if (!endAt) return;
  await chrome.alarms.clear("tab-timer");
  await chrome.alarms.create("tab-timer", { when: Math.max(Date.now() + 1000, endAt) });
};

const ensureStartupState = async () => {
  const state = await chrome.storage.local.get(["automatic", "hours", "mins", "seconds", "timerRunning", "timerPaused", "countdownSeconds", "timerEndAt"]);
  const automatic = state.automatic !== undefined ? Boolean(state.automatic) : true;
  const configuredTotal = getTotalSeconds(state.hours, state.mins, state.seconds);

  if (!automatic) {
    await chrome.storage.local.set({ timerRunning: false, timerStatus: "" });
    return;
  }

  if (state.timerPaused === true) {
    await chrome.alarms.clear("tab-timer");
    await chrome.storage.local.set({
      automatic: true,
      timerRunning: false,
      timerPaused: true,
      timerEndAt: null
    });
    return;
  }

  if (configuredTotal <= 0) {
    await chrome.storage.local.set({
      timerRunning: false,
      countdownSeconds: 0,
      timerStatus: "Set a cooldown greater than 0 seconds."
    });
    return;
  }

  const remaining = state.timerEndAt ? asNumberOr(state.countdownSeconds, configuredTotal) : configuredTotal;
  const endAt = asNumberOr(state.timerEndAt, Date.now() + remaining * 1000);

  await chrome.storage.local.set({
    automatic: true,
    timerRunning: true,
    timerPaused: false,
    countdownSeconds: remaining,
    timerEndAt: endAt,
    timerStatus: ""
  });

  await scheduleTimerAlarm(endAt);
  await logTimerState("startup");
};

const advanceTimer = async (expectedEndAt = null) => {
  const state = await chrome.storage.local.get(["automatic", "timerRunning", "hours", "mins", "seconds", "timerEndAt", "activeTabId", "validTabTimers"]);
  if (!state.automatic || !state.timerRunning) return;
  if (expectedEndAt !== null && Number(state.timerEndAt) !== Number(expectedEndAt)) return;
  if (Number(state.timerEndAt) > Date.now()) return;

  const configuredTotal = getTotalSeconds(state.hours, state.mins, state.seconds);
  if (configuredTotal <= 0) {
    await chrome.storage.local.set({ timerRunning: false, countdownSeconds: 0, timerEndAt: null });
    return;
  }

  const activeTabId = asNumberOr(state.activeTabId, null);
  const closeResult = await closeNextTab(activeTabId);
  if (closeResult.reason === "busy") return;

  if (!closeResult.closed && closeResult.reason !== "busy") {
    const status = closeResult.reason === "minimum-tabs"
      ? "Timer stopped: 5 or fewer tabs remain, so another tab cannot be closed."
      : "Timer stopped: all remaining tabs are excluded from the timer.";
    await chrome.alarms.clear("tab-timer");
    await chrome.storage.local.set({
      timerRunning: false,
      timerPaused: false,
      countdownSeconds: 0,
      timerEndAt: null,
      timerStatus: status
    });
    await notifyTimerStopped(status);
    return;
  }

  const endAt = Date.now() + configuredTotal * 1000;
  await chrome.storage.local.set({
    timerRunning: true,
    timerPaused: false,
    countdownSeconds: configuredTotal,
    timerEndAt: endAt,
    timerStatus: ""
  });
  await scheduleTimerAlarm(endAt);
  await logTimerState("nextTimer");
};

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.timerRunning?.newValue === false || changes.timerPaused?.newValue === true) {
    await chrome.alarms.clear("tab-timer");
    return;
  }

  const endAt = changes.timerEndAt?.newValue;
  if (changes.timerRunning?.newValue === true && Number.isFinite(Number(endAt))) {
    await scheduleTimerAlarm(Number(endAt));
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tab-timer") return;

  const state = await chrome.storage.local.get(["automatic", "timerRunning", "timerEndAt"]);
  if (!state.automatic || !state.timerRunning) return;

  if (Number(state.timerEndAt) <= Date.now()) {
    await advanceTimer(Number(state.timerEndAt));
  } else {
    await scheduleTimerAlarm(Number(state.timerEndAt));
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStartupState();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStartupState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "advance-timer") {
    advanceTimer(Number(message.endAt))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("[TabTimer:advance] failed", error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message && (message.type === "start-timer" || message.type === "reschedule-tabs")) {
    const operation = message.type === "start-timer"
      ? scheduleTimerAlarm(Number(message.endAt))
      : ensureStartupState();

    operation
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("[TabTimer:start] failed", error);
        sendResponse({ ok: false });
      });
    return true;
  }
  return true;
});

const registerContextMenu = async () => {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create(
    {
      id: "SendDashboard",
      title: "Send To Dashboard",
      contexts: ["tab"]
    }
  );
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "SendDashboard" && tab?.id) {
    try {
      await saveTabToDashboard(tab);
      await chrome.tabs.remove(tab.id);
    } catch (error) {
      console.error(`[TabTimer:contextMenu] failed to send tab ${tab.id} to dashboard`, error);
    }
  }
});

registerContextMenu().catch((error) => {
  console.error("[TabTimer:contextMenu] failed to register menu", error);
});

