let newFolder_button = document.getElementById("New_Folder");
let openSideBar_button = document.querySelector(".openSideBar");
let closeSideBar_button = document.querySelector(".closeSideBar");
let sideBar = document.querySelector(".SideBar");
let sideBar_selected = document.querySelector(".SideBar_Selected");
let sideBar_not_selected = document.querySelector(".SideBar_Not_Selected");
let currFolder_ID = document.querySelector(".folderID");
let name_input = document.getElementById("nameInput")
let enter_right = document.querySelector(".Enter-Right")
let submit_name = document.querySelector(".Submit-Name")
let changeLink_bttn = document.querySelector(".Submit-Link")
let changeLink_Input = document.getElementById("linkInput")
let changeLink_form = document.querySelector(".Link")
let changeLink_Enter_right = document.querySelector(".Enter-Right-Link")
let tabSummary = document.querySelector(".TabSummary")


const folder_map = new Map();

let folderNum = 0;
let tabNum = 0;

// Folder Name, Folder ID, Array of Tabs
let folders = [];

let selectedFolder_ID = null;
let selectedTab_ID = null;
const summaryRequests = new Map();
const summaryFailures = new Map();

const normalizeUrl = (url) => /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;

const fetchTabSummary = async (title, url) => {
    const response = await fetch("https://tabgrab-server.onrender.com/summarize", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ title, url })
    });

    const result = await response.json();
    if (!response.ok || !result.summary) {
        throw new Error(result.error || `Summary request failed with status ${response.status}`);
    }
    return result.summary;
};

const saveTabSummary = async (tabId, summary) => {
    for (const folder of folders) {
        const tab = (folder.tabs || []).find(item => String(item.id) === String(tabId));
        if (tab) {
            tab.summary = summary;
            await chrome.storage.local.set({ folders, folderNum, tabNum });
            return;
        }
    }
};

/*
search_button.onclick = async () => {
    const {folders} = await chrome.storage.local.get(["folders"]);

    const searchValue = search_input.value.trim().toLowerCase();


    for(let folder of folders){
        let folderElement = document.querySelector(`.folder-header-${folder.id}`);
        if(folder.name.toLowerCase().includes(searchValue)){
            folderElement.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
            break;
        }
        let tabFound = false;
        for(let tabs of folder.tabs){
            let folderElement = document.getElementById(String(folder.id));
            if(tabs.title.toLowerCase().includes(searchValue)){
                let toggleBttn = folderElement.querySelector(".seeTabs");
                let tabsContainer = folderElement.querySelector(
                    `[class^="folder-tabs-"]`
                );
                toggleBttn.textContent = "v";
                toggleBttn.classList.replace("seeTabs", "hideTabs");
                if(tabsContainer){
                    tabsContainer.style.display = "flex";
                    console.log("exists");
                }
                let tabElement = folderElement.querySelector(
                    `.TabInstance[data-tab-id="${tabs.id}"]`
                );
                tabElement.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
                tabFound = true;
                break;
            }
        }
        if(tabFound) break;
    }
}
*/


document.addEventListener("DOMContentLoaded", function() {
    chrome.storage.local.get(["folders", "folderNum", "tabNum"], function(data) {
        folders = data.folders || [];
        folderNum = Number.isFinite(Number(data.folderNum)) ? Number(data.folderNum) : folders.length;
        const storedTabIds = folders.flatMap(folder => (folder.tabs || [])
            .map(tab => Number(tab.id))
            .filter(Number.isFinite));
        const nextTabId = storedTabIds.length ? Math.max(...storedTabIds) + 1 : 0;
        tabNum = Number.isFinite(Number(data.tabNum)) ? Number(data.tabNum) : nextTabId;

        let repairedTabs = false;
        folders.forEach(folder => {
            folder.tabs = folder.tabs || [];
            folder.tabs.forEach(tab => {
                if (tab.id === undefined || tab.id === null) {
                    tab.id = tabNum++;
                    repairedTabs = true;
                }
                if (tab.parent_id === undefined || tab.parent_id === null) {
                    tab.parent_id = folder.id;
                    repairedTabs = true;
                }
            });
        });
        if (repairedTabs) {
            chrome.storage.local.set({ folders, folderNum, tabNum });
        }

        console.log("Loaded folders:", folders);

        RetrieveFolders();
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.folders) return;

    const expandedFolderIds = new Set(
        [...document.querySelectorAll(".FolderInstance")]
            .filter(folderElement => {
                const tabsContainer = folderElement.querySelector('[class^="folder-tabs-"]');
                return tabsContainer && tabsContainer.style.display !== "none";
            })
            .map(folderElement => folderElement.id)
    );

    folders = changes.folders.newValue || [];
    document.getElementById("folders").replaceChildren();
    RetrieveFolders(expandedFolderIds);
});

function RetrieveFolders(expandedFolderIds = new Set()) {
    for(let i = 0; i < folders.length; i++){
        const folder = folders[i];
        const folderInstance = new FolderInstance(folder);
        for(let j = 0; j<(folder.tabs || []).length; j++){
            const tabInstance = new TabInstance(folder.tabs[j]);
            folderInstance.tabsContainer.appendChild(tabInstance.element);
            console.log("retrieved tab:", folder.tabs[j].name, "with ID:", folder.tabs[j].id);
        }

        if (expandedFolderIds.has(String(folder.id))) {
            const toggleBtn = folderInstance.element.querySelector(".seeTabs");
            toggleBtn.textContent = "v";
            toggleBtn.classList.replace("seeTabs", "hideTabs");
            folderInstance.tabsContainer.style.display = "flex";
        }

        document.getElementById("folders").appendChild(folderInstance.element);
    }
}



const updateSidebar = (folder, summary) => {
    const selectionType = folder ? selectedFolder_ID : selectedTab_ID;
    const hasSelection = selectionType !== null;
    sideBar_selected.style.display = hasSelection ? "flex" : "none";
    sideBar_not_selected.style.display = hasSelection ? "none" : "flex";
    if(folder){
        currFolder_ID.textContent = "Folder ID : " + String(selectedFolder_ID)
        changeLink_form.style.display = "none"
        changeLink_Enter_right.style.display = "none"
        changeLink_Input.style.display = "none";
        changeLink_bttn.style.display = "none"
        tabSummary.style.display = "none";
    }else{
        currFolder_ID.textContent = "Tab ID : " + String(selectedTab_ID);
        changeLink_form.style.display = "flex"
        changeLink_Input.style.display = "flex";
        changeLink_bttn.style.display = "flex"
        tabSummary.style.display = "flex"
        const tabSum_label = document.querySelector(".TabSummary_Label");
        tabSum_label.textContent = summary || "No summary available for this tab.";
    }
};

submit_name.onclick = () => {
    const newName = name_input.value.trim();
    if(newName && selectedTab_ID !== null){
        const tabElement = document.querySelector(`.TabInstance[data-tab-id="${selectedTab_ID}"]`);
        const folderIndex = folders.findIndex(folder =>
            (folder.tabs || []).some(tab => String(tab.id) === String(selectedTab_ID))
        );
        const tabIndex = folderIndex === -1 ? -1 : folders[folderIndex].tabs.findIndex(tab =>
            String(tab.id) === String(selectedTab_ID)
        );

        if (tabElement && tabIndex !== -1) {
            folders[folderIndex].tabs[tabIndex].title = newName;
            tabElement.querySelector("a").textContent = newName;
            chrome.storage.local.set({ folders, folderNum, tabNum });
        }
        enter_right.style.display = "none";
    } else if(newName && selectedFolder_ID !== null){
        const currFolder = document.getElementById(`${selectedFolder_ID}`);
        const folderName = currFolder.querySelector(".folder_name");
        const folderIndex = folders.findIndex(folder => String(folder.id) === String(selectedFolder_ID));

        if (folderIndex !== -1) {
            folders[folderIndex].name = newName;
            folderName.textContent = newName;
            folder_map.set(String(selectedFolder_ID), newName);
            chrome.storage.local.set({ folders, folderNum, tabNum });
        }
        enter_right.style.display = "none";
    }else enter_right.style.display = "block";
}

changeLink_bttn.onclick = () => {
    const newLink = changeLink_Input.value.trim();
    if(newLink && selectedTab_ID !== null){
        const tabElement = document.querySelector(`.TabInstance[data-tab-id="${selectedTab_ID}"]`);
        const folderIndex = folders.findIndex(folder =>
            (folder.tabs || []).some(tab => String(tab.id) === String(selectedTab_ID))
        );
        const tabIndex = folderIndex === -1 ? -1 : folders[folderIndex].tabs.findIndex(tab =>
            String(tab.id) === String(selectedTab_ID)
        );

        if(tabElement && tabIndex !== -1){
            const normalizedLink = normalizeUrl(newLink);
            folders[folderIndex].tabs[tabIndex].url = normalizedLink;
            tabElement.querySelector("a").href = normalizedLink;
            chrome.storage.local.set({ folders, folderNum, tabNum });
            changeLink_Enter_right.style.display = "none";
        }
    }else{
        changeLink_Enter_right.style.display = "block";
    }
}

export class TabInstance{
    constructor(tab){
        this.url = tab.url;
        this.title = tab.title;
        this.icon = tab.icon || tab.favIconUrl || chrome.runtime.getURL("images/browserIcon.png");
        this.id = String(tab.id);
        this.parent_id = String(tab.parent_id);
        this.element = document.createElement("div");
        this.element.className = "TabInstance";
        this.element.dataset.tabId = this.id;
        this.summary = tab.summary;
        this.element.innerHTML = `
            <img src="${this.icon}" alt="">
            <div class="tab-title">
                <a href="${normalizeUrl(this.url)}" target="_blank" rel="noopener noreferrer">${this.title}</a>
            </div>
            <button class="removeTab">-</button>
            <br>
        `;

        const iconElement = this.element.querySelector("img");
        iconElement.onerror = () => {
            iconElement.onerror = null;
            iconElement.src = chrome.runtime.getURL("images/browserIcon.png");
        };

        const removeBtn = this.element.querySelector(".removeTab");
        removeBtn.onclick = () => {
            this.element.remove();
            let index = folders.findIndex(folder => String(folder.id) === this.parent_id);

            if(index != -1){
                let tabIdx = folders[index].tabs.findIndex(t => String(t.id) === this.id)
                if (tabIdx !== -1) {
                    folders[index].tabs.splice(tabIdx, 1);
                    chrome.storage.local.set({
                        folders: folders,
                        folderNum: folderNum,
                        tabNum : tabNum
                    });
                }
            }
        }
        this.element.addEventListener("mouseenter", async () => {
            selectedTab_ID = this.id;
            selectedFolder_ID = null;
            console.log("changed:", selectedTab_ID);
            if (this.summary) {
                updateSidebar(false, this.summary);
                return;
            }

            const lastFailure = summaryFailures.get(this.id);
            if (lastFailure && Date.now() - lastFailure < 15000) {
                updateSidebar(false, "Summary request was throttled. Try again in a few seconds.");
                return;
            }

            updateSidebar(false, "Generating summary...");
            try {
                let summaryRequest = summaryRequests.get(this.id);
                if (!summaryRequest) {
                    summaryRequest = fetchTabSummary(this.title, this.url)
                        .finally(() => summaryRequests.delete(this.id));
                    summaryRequests.set(this.id, summaryRequest);
                }

                this.summary = await summaryRequest;
                summaryFailures.delete(this.id);
                await saveTabSummary(this.id, this.summary);
                if (selectedTab_ID === this.id) {
                    updateSidebar(false, this.summary);
                }
            } catch (error) {
                summaryFailures.set(this.id, Date.now());
                console.error("[Dashboard:summary] failed", error);
                if (selectedTab_ID === this.id) {
                    updateSidebar(false, "Unable to generate summary.");
                }
            }
        });
    }
}

export class FolderInstance {
    constructor(folder){
        this.name = folder.name;
        this.icon = folder.icon;
        this.element = document.createElement("div");
        this.element.className = "FolderInstance";
        this.element.id = String(folder.id);

        this.element.innerHTML = `
            <div class="folder-header-${this.element.id}">
                <img src="${this.icon}">
                <div>
                    <label class="folder_name">${this.name}</label>
                </div>
                <button class="newTab">+</button>
                <button class="removeFolder">-</button>
                <button class="seeTabs"> > </button>
            </div>
            <div class="folder-tabs-${this.element.id}"></div>
        `;

        const toggleBtn = this.element.querySelector(".seeTabs");
        const removeBtn = this.element.querySelector(".removeFolder");
        const newTab = this.element.querySelector(".newTab");
        this.tabsContainer = this.element.querySelector(`.folder-tabs-${this.element.id}`);

        folder_map.set(this.element.id, this.name);

        this.element.addEventListener("mouseenter", () => {
            selectedFolder_ID = this.element.id;
            selectedTab_ID = null;
            console.log("changed:", selectedFolder_ID);
            updateSidebar(true, null);
        });
        // Re-initialize when dashboard reload
        toggleBtn.textContent = ">";
        toggleBtn.classList.replace("hideTabs", "seeTabs");
        this.tabsContainer.style.display = "none"; 
        
        toggleBtn.onclick = () => {
            if (toggleBtn.classList.contains("seeTabs")) {
                toggleBtn.textContent = "v";
                toggleBtn.classList.replace("seeTabs", "hideTabs");
                this.tabsContainer.style.display = "flex";
            } else {
                toggleBtn.textContent = ">";
                toggleBtn.classList.replace("hideTabs", "seeTabs");
                this.tabsContainer.style.display = "none"; 
            }
        };

        removeBtn.onclick = () => {
            this.element.remove();
            selectedFolder_ID = null;
            let index = folders.findIndex(folder => folder.id === this.element.id);

            if (index !== -1) {
                folders.splice(index, 1);
                chrome.storage.local.set({
                        folders: folders,
                        folderNum: folderNum,
                        tabNum: tabNum
                    });
            }
            updateSidebar(true, null);
        };

        newTab.onclick = () => {
            const tab = {
                url: "https://google.com",
                title: "Google",
                icon: "",
                id: tabNum,
                parent_id: this.element.id,
            };

            tabNum++;
            
            let index = folders.findIndex(folder => folder.id === this.element.id);

            if (index !== -1) {
                folders[index].tabs = folders[index].tabs || [];
                folders[index].tabs.push(tab);
                chrome.storage.local.set({
                    folders: folders,
                    folderNum: folderNum,
                    tabNum: tabNum
                });
            }

            const tabInstance = new TabInstance(tab, true);
            this.tabsContainer.appendChild(tabInstance.element);
            toggleBtn.textContent = "v";
            toggleBtn.classList.replace("seeTabs", "hideTabs");
            this.tabsContainer.style.display = "flex";
        };
    }
}


export const NewFolder = (folder_name) => {
    const folder = {
        name: folder_name,
        icon: "",
        id: String(folderNum),
        tabs: [],
    };

    folderNum++;
    folders.push(folder);
    chrome.storage.local.set({
        folders: folders,
        folderNum: folderNum,
        tabNum: tabNum
    });

    const folderInstance = new FolderInstance(folder);
    document.getElementById("folders").appendChild(folderInstance.element);
}

const OpenSideBar = () => {
    sideBar.style.display = 'flex'; 
    sideBar.style.animationName = 'OpenSideBarAnim';
    sideBar.style.animationDuration = '0.3s';
    openSideBar_button.style.display = 'none';
}

const CloseSideBar = () => {
    sideBar.style.animation = 'CloseSideBarAnim 0.3s forwards';
    setTimeout(() => {
        sideBar.style.display = 'none';
        openSideBar_button.style.display = 'block';
    }, 300);
}

newFolder_button.onclick = () => {
    NewFolder("Folder");
}

openSideBar_button.onclick = () => {
    OpenSideBar();
}

closeSideBar_button.onclick = () => {
    CloseSideBar();
}