let folders = [];
let allNodes = [];

let global_connections = {};

const sideBar = document.querySelector(".sideBar");

const canvas = document.querySelector(".nodes_container");
const world = document.querySelector(".flow_world");
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

let newLine = null;
let newLineStartNode = null;
let creatingNewLine = false;

canvas.addEventListener("mousedown", (event) => {
    if (event.target.closest(".Tab_Node") || event.target.closest(".sideBar") || event.target.closest("#connections line")){
        return;
    }
    isPanning = true;
    startX = event.clientX - panX;
    startY = event.clientY - panY;
    canvas.classList.add("panning");
})

document.addEventListener("mousemove", (event)=>{
    if (!creatingNewLine || !newLine) {
        return;
    }
    if(!isPanning) return;
    panX = event.clientX - startX;
    panY = event.clientY - startY;
    world.style.transform = `translate(${panX}px, ${panY}px)`;
    canvas.style.backgroundPosition = `${panX}px ${panY}px`;
    const svg = document.querySelector("#connections");
    const container = svg.getBoundingClientRect();
    const x = event.clientX - container.left;
    const y = event.clientY - container.top;
    newLine.setAttribute("x2", x);
    newLine.setAttribute("y2", y);
})

document.addEventListener("mouseup", ()=>{
    isPanning = false;
    canvas.classList.remove("panning");
})


const AI_Connect = async (tab_data) => {

    console.log("AI_Connect started");

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 35000);

    try {
        const resp = await fetch(
            "https://tabgrab-server.onrender.com/connect",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    tab_data: tab_data
                }),
                signal: controller.signal
            }
        );
        if (!resp.ok) {
            throw new Error(
                `Connection request failed: ${resp.status}`
            );
        }
        const data = await resp.json();
        console.log("AI_Connect finished");
        return data.connection_data;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Connection request timed out");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

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
        this.element.style.left = `${Math.floor(Math.random() * (90 - 15 + 1)) + 15}%`;
        this.element.style.top = `${Math.floor(Math.random() * (90 - 15 + 1)) + 15}%`;
        this.element.addEventListener("mousedown", (event) => {
            if(event.button === 2){
                return;
            }
            if(creatingNewLine && event.button === 0){
                if(this.element === newLineStartNode){
                    return;
                }
                const svg = document.querySelector("#connections");
                const container = svg.getBoundingClientRect();
                const rect = this.element.getBoundingClientRect();
                const x = rect.left + rect.width / 2 - container.left;
                const y = rect.top + rect.height / 2 - container.top;

                newLine.setAttribute("x2", x);
                newLine.setAttribute("y2", y);
                newLineStartNode.connections.push({node: this.element, line: newLine})
                newLine.setAttribute("stroke", "white");
                creatingNewLine = false;
                newLine = null;
                newLineStartNode = null;
                return;
            }
            const node = this.element;

            const rect = node.getBoundingClientRect();

            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;

            const UpdatePos = (event) => {
                const worldRect = world.getBoundingClientRect();
                node.style.left = event.clientX - offsetX - worldRect.left + "px";
                node.style.top = event.clientY - offsetY - worldRect.top + "px";
                for (const connection of this.connections) {
                    this.updateLine(connection.line, connection.node);
                }
                for (const otherNode of allNodes) {
                    for (const connection of otherNode.connections) {
                        if (connection.node === this.element) {
                            otherNode.updateLine(connection.line, connection.node);
                        }
                    }
                }
            }

            document.addEventListener("mousemove", UpdatePos);
            document.addEventListener("mouseup", function() {
                document.removeEventListener("mousemove", UpdatePos);
            }, { once: true });
        })

        this.element.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            creatingNewLine = true;
            newLineStartNode = this;
        })

        this.connections = [];
    }

    connectTo(connection_node, relevance){
        if (!this.connections.some(c => c.node === connection_node)) {
            const svg = document.querySelector("#connections");
            const rect1 = this.element.getBoundingClientRect();
            const rect2 = connection_node.getBoundingClientRect();
            const container = svg.getBoundingClientRect();

            const x1 = rect1.left + rect1.width / 2 - container.left;
            const y1 = rect1.top + rect1.height / 2 - container.top;

            const x2 = rect2.left + rect2.width / 2 - container.left;
            const y2 = rect2.top + rect2.height / 2 - container.top;

            const line = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
            )

            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);

            line.setAttribute("stroke-width", "3");
            line.setAttribute("stroke-linecap", "round");
            line.setAttribute("stroke-opacity", "0.75");
            line.setAttribute("filter", "url(#lineGlow)");
            svg.appendChild(line);

            this.connections.push({node: connection_node, line: line});
            let result = "";
            if (relevance > .75) {
                line.setAttribute("stroke", "rgb(50, 220, 100)");
                result = "Great Relation";
            } else if (relevance > .50) {
                line.setAttribute("stroke", "rgb(240, 200, 50)");
                result = "Mixed Relation"
            } else {
                line.setAttribute("stroke", "rgb(230, 70, 70)");
                result = "Little Relation"
            }

            line.addEventListener("click", ()=>{
                sideBar.style.display = "flex";
                const line_data = {
                    relevance : relevance,
                    result: result,
                    tab1_icon : this.icon,
                    tab1_title : this.title,
                    tab1_link : this.url,
                    tab2_icon: connection_node.icon,
                    tab2_title : connection_node.title,
                    tab2_link : connection_node.link,
                }
                const relevance_percentage = sideBar.querySelector("#relevance");
                const relevance_description = sideBar.querySelector(".Relevance_Result");
                
                const tab1_icon = sideBar.querySelector("#tab1_icon");
                const tab1_title = sideBar.querySelector("#Tab1_Title");
                const tab1_link = sideBar.querySelector("#link1_label");

                const tab2_icon = sideBar.querySelector("#tab2_icon");
                const tab2_title = sideBar.querySelector("#Tab2_Title");
                const tab2_link = sideBar.querySelector("#link2_label");

                relevance_percentage.textContent = `Relation : ${line_data.relevance}`;
                relevance_description.textContent = line_data.result;
                tab1_icon.src = line_data.tab1_icon;
                tab1_title.textContent = line_data.tab1_title;
                tab1_link = `Link : ${tab1_link}`;
                tab2_icon.src = line_data.tab2_icon;
                tab2_title.textContent = line_data.tab2_title;
                tab2_link = `Link : ${tab2_link}`;
            })

            this.updateLine(line, connection_node);
        }
    }

    updateLine(line, connection_node) {
        const svg = document.querySelector("#connections");

        const rect1 = this.element.getBoundingClientRect();
        const rect2 = connection_node.getBoundingClientRect();
        const container = svg.getBoundingClientRect();

        const x1 = rect1.left + rect1.width / 2 - container.left;
        const y1 = rect1.top + rect1.height / 2 - container.top;

        const x2 = rect2.left + rect2.width / 2 - container.left;
        const y2 = rect2.top + rect2.height / 2 - container.top;

        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    const data = await chrome.storage.local.get(["folders"]);
    folders = data.folders || [];
    const allTabs = [];
    folders.forEach(folder => {
        folder.tabs = folder.tabs || [];
        folder.tabs.forEach(tab => {
            const node_container = document.querySelector(".flow_world");
            const nodeInstance = new TabNode(tab);
            node_container.append(nodeInstance.element);
            allNodes.push(nodeInstance);
            allTabs.push(tab);
        });
    })
    if(allNodes.length > 0){
        console.log("About to call AI_Connect");
        global_connections = await AI_Connect(allTabs)
        chrome.storage.local.set({global_connections})
        console.log(global_connections)
        for(const connection of global_connections){
            const node1 = allNodes.find( node => 
                node.url === connection.tab1
            )
            const node2 = allNodes.find( node => 
                node.url === connection.tab2
            )
            if(!node1 || !node2) continue;
            else console.log("yay");
            node1.connectTo(node2.element, connection.relevance)
        }
    }
    
});
