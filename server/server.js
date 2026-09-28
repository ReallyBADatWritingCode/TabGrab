require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const express = require("express")
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.use(cors());
app.use(express.json());

async function Register_UserMessage(message, tab_data){
    const readableTabData = JSON.stringify(tab_data ?? {}, null, 2);
    const response = await ai.models.generateContent({
        model : "gemini-3.1-flash-lite",
        contents : `Answer the user's message/question: ${message}

                Use the tab data to answer accurately. The savedAt field is the time the tab was saved to this dashboard, not the browser's original creation time. If a tab has no savedAt field, say that its save time was not recorded. Convert savedAt.date into a natural date and time when answering.

                    Tab data:
                    ${readableTabData}`,
        config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
    })
    return response.text.trim()
}

async function Connection_Create(tab_data) {

    console.log("Connection_Create started");

    const simplifiedTabs = (tab_data || []).map(tab => ({
        title: tab.title || "",
        url: tab.url || "",
        summary: tab.summary || ""
    }));

    console.log("Number of tabs:", simplifiedTabs.length);
    const readableTabData = JSON.stringify(
        simplifiedTabs,
        null,
        2
    );

    console.log("Prompt data length:", readableTabData.length);
    console.log("Sending request to Gemini...");
    const storageData = await chrome.storage.local.get([
        "global_connections"
    ]);

    const global_connections =
        storageData.global_connections || [];
    
    console.log(global_connections);

    const response = await ai.models.generateContent({

        model: "gemini-3.1-flash-lite",

        contents: `
        Current Global connections : ${JSON.stringify(global_connections, null, 2)}
Analyze these saved browser tabs and identify meaningful relationships between them.

A relationship means that two tabs are meaningfully related by topic, subject, purpose, or the information they contain. Use the tab's title, URL, and summary to determine whether a relationship exists.

For every relationship, assign a "relevance" score from 0.00 to 1.00 representing how strongly the two tabs are related.

Relevance scale:
- 0.00 = completely unrelated
- 0.25 = weak relationship
- 0.50 = moderately related
- 0.75 = strongly related
- 1.00 = extremely closely related

Only return relationships with meaningful relevance. Do not return pairs that are essentially unrelated.

Return ONLY valid JSON in exactly this format:

{
    "connections": [
        {
            "tab1": "EXACT URL",
            "tab2": "EXACT URL",
            "relevance": 0.00
        }
    ]
}

Rules:

- DON'T CALCULATE THE RELEVANCE OF ALREADY EXISTING CONNECTIONS!!!!
- Return global connections array with your new connections found
- Only include meaningful relationships.
- Do not connect tabs just because they are both websites or belong to the same broad category.
- Consider the actual subject matter of the tabs.
- Use the title, URL, and summary when determining relevance.
- Do not connect a tab to itself.
- Each pair of URLs must appear ONLY ONCE.
- A relationship between A and B should appear as either:
  {"tab1": "A", "tab2": "B", "relevance": 0.85}
  OR
  {"tab1": "B", "tab2": "A", "relevance": 0.85}
  but NEVER both.
- Do not return both A → B and B → A.
- Use the EXACT URLs provided in the tab data.
- Do not invent URLs.
- Do not include duplicate pairs.
- "relevance" must be a NUMBER, not a string.
- "relevance" must be between 0.00 and 1.00.
- Use two decimal places for the relevance score.
- The relevance score should represent how strongly the two specific tabs are related, not how useful or important either tab is.
- If two tabs have no meaningful relationship, do not connect them.
- If there are no meaningful relationships, return:
{"connections":[]}
- Return ONLY the JSON object. Do not include explanations, markdown, or code fences.

Saved tabs:

${readableTabData}
`,

        config: {
            thinkingConfig: {
                thinkingLevel: "low"
            }
        }
    });

    console.log("Gemini responded!");
    let text = response.text.trim();
    console.log("Raw Gemini response:", text);
    if (text.startsWith("```")) {
        text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        console.error("FAILED TO PARSE GEMINI JSON:");
        console.error(text);
        throw new Error("Gemini returned invalid JSON");
    }
    return parsed.connections || [];
}

async function Organize(title, url) {
    const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
                You are organizing a user's browser tabs.

                Determine the MAIN GENERAL TOPIC of this tab.

                Use broad categories such as:
                - School
                - Programming
                - Robotics
                - Game Development
                - Sports
                - Entertainment
                - Shopping
                - News
                - Finance
                - Travel
                - Social Media
                - Research

                BUT YOU CAN USE OTHER CATEGORIES SO DON'T RESTRICT YOURSELF

                Do NOT create overly specific categories.
                
                BUT you can use semi-specific but not TOO specific to the point where there is a new folder for every new tab.

                Like for example(Use this example and also integrate it into other categories not just the one the example is of) for entertainment depending on the context of title you can split it into:
                - Music
                - Comic book movies
                - TV Shows
                etc.

                Also if you can't determine a folder name that seems like it could fit a broader amount of tabs since like the tab has a vague name like : "It can't be..." (EXAMPLE SO REMEMBER TO APPLY TO OTHER SCENARIOS) send it to a folder called Other

                Tab title:
                ${title}

                Tab URL:
                ${url}

                Return only the category name.
                `,
            config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
        });

    return response.text.trim();
}

async function GeneratePageText(url){
    if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error("Only HTTP and HTTPS URLs can be summarized");
    }

    const response = await axios.get(url, {
        timeout: 5000,
        headers: {
            "User-Agent" : "Mozilla/5.0"
        }
    });

    const $ = cheerio.load(response.data);
    const pageData = {
        url,
        title: $("title").text(),
        description: $("meta[name='description'], meta[property='og:description']").attr("content") || "",
        headings: $("h1, h2, h3").map((i, el) => $(el).text()).get(),
        paragraphs: $("p").map((i, el) => $(el).text()).get(),
        lists: $("li").map((i, el) => $(el).text()).get(),
        images: $("img").map((i, el) => ({
            alt: $(el).attr("alt"),
            src: $(el).attr("src")
        })).get(),
        videos: $("video").map((i, el) => ({
            src: $(el).attr("src")
        })).get()
    };
    return pageData;
}

async function Generate_TabSummary(pageData, title) {
    const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
                Based on the webpage text below, write a concise 2–3 sentence summary of the webpage.
                NOT TOO LONG PLEASE(even if it is 2-3 sentences)
                Title: ${title}

                Webpage data:
                ${JSON.stringify(pageData)}

                If the page data is unavailable, give the best concise description possible from the title and URL. Do not respond with "unable to generate summary" unless both the title and URL are missing.
                Focus on the main topic, purpose, and most important information. Only use information supported by the provided webpage text. Do not make up or assume information that is not present. Do not mention that you are summarizing the text.
                        `,
            config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
        });

    return response.text.trim();
}

app.post("/connect", async (req, res) => {

    console.log("CONNECT REQUEST RECEIVED");

    const { tab_data } = req.body;

    try {
        const connection_data = await Promise.race([
            Connection_Create(tab_data),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error("Gemini connection request timed out"));
                }, 30000);
            })
        ]);
        console.log("CONNECT REQUEST FINISHED");
        res.json({
            connection_data: connection_data
        });
    } catch (error) {
        console.error("CONNECT ERROR:", error);
        if (!res.headersSent) {
            res.status(500).json({
                error: error.message || "Unable to generate connections"
            });
        }
    }
});

app.post("/organize", async (req, res) => {
    const {title, url} = req.body;

    try {
        const folder = await Organize(title, url);
        res.json({folder:folder});
    }catch(error){
        console.error(error);

    }
})

app.post("/chat", async(req, res) => {
    const {tab_data, message} = req.body;

    try { 
        const chat_response = await Register_UserMessage(message, tab_data);
        res.json({chat_response : chat_response})
    }catch(error){
        console.error(error);
        res.status(500).json({error: error.message || "Unable to generate chat response"});
    }
})

app.post("/summarize", async(req, res) => {
    const {title, url} = req.body;

    try {
        let pageData;
        try {
            pageData = await GeneratePageText(url);
        } catch (error) {
            console.warn(`[summarize] Could not fetch ${url}:`, error.message);
            pageData = {
                url: url || "",
                title: title || "",
                description: "",
                headings: [],
                paragraphs: [],
                lists: [],
                images: [],
                videos: [],
                fetchError: "The page could not be fetched; use the title and URL only."
            };
        }

        const tabSummary = await Generate_TabSummary(pageData, title);
        res.json({summary : tabSummary})
    }catch(error){
        console.error(error);
        res.status(500).json({error: error.message || "Unable to generate tab summary"});
    }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});