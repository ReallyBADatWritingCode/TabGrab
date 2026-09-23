let folders = [];
let allNodes = [];

let global_connections = {};


const AI_Connect = async (tab_data) => {
  const resp = await fetch("https://tabgrab-server.onrender.com/connect", {
    method: "POST",
    headers : {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      tab_data : tab_data 
    })
  });
  if (!resp.ok) {
    throw new Error(`Connection request failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.connection_data;
}

class TabNode {
    constructor(tab){
        this.url = tab.url;
        this.title = tab.title;
        this.icon = tab.icon || tab.favIconUrl || chrome.runtime.getURL("images/browserIcon.png");
        this.id = String(tab.id);
        this.element = document.createElement("div");
        this.element.className = "Tab_Node";
        this.element.dataset.tabId = this.id;
        this.summary = tab.summary;
        this.element.innerHTML = `
            <label>${this.title}</label>
        `
        this.element.style.left = `${Math.floor(Math.random() * (100 - 15 + 1)) + 15}%`;
        this.element.style.top = `${Math.floor(Math.random() * (100 - 15 + 1)) + 15}%`;
        this.element.addEventListener("mousedown", (event) => {

            const node = this.element;

            const offsetX = event.clientX - node.offsetLeft;
            const offsetY = event.clientY - node.offsetTop;

            function UpdatePos(event) {
                node.style.left = event.clientX - offsetX + "px";
                node.style.top = event.clientY - offsetY + "px";
            }

            document.addEventListener("mousemove", UpdatePos);
            document.addEventListener("mouseup", function() {
                document.removeEventListener("mousemove", UpdatePos);
            }, { once: true });
        })

        this.connections = [];
    }

    connectTo(connection_node){
        if (!this.connections.includes(connection_node)) {
            this.connections.push(connection_node);
        }
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    const data = await chrome.storage.local.get(["folders"]);
    folders = data.folders || [];
    const allTabs = [];
    folders.forEach(folder => {
        folder.tabs = folder.tabs || [];
        folder.tabs.forEach(tab => {
            const node_container = document.querySelector(".nodes_container");
            const nodeInstance = new TabNode(tab);
            node_container.append(nodeInstance.element);
        });
        if(folder.tabs){
            folder.tabs.forEach(tab => allTabs.push(tab));
        }
    })
    if(allTabs.length > 0){
        allTabs.forEach(tab => {
            const node = new TabNode(tab);
            allNodes.push(node);
        })
        console.log("About to call AI_Connect");
        global_connections = await AI_Connect(allTabs)
        console.log(global_connections)
    }
    
});
