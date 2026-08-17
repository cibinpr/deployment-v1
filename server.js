const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 5000);

const APP_DIR = __dirname;
const BOT_FILE = path.join(APP_DIR, "bot.js");

// Your bot writes its log according to config.js.
// If accepted-orders.log is inside the same directory as bot.js,
// this path will work.
const LOG_PATH = path.join(APP_DIR, "accepted-orders.log");

let botProcess = null;
let botStartedAt = null;


// ============================================================
// RESPONSE HELPERS
// ============================================================

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
    });

    res.end(body);
}


function sendText(res, statusCode, text) {
    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(text)
    });

    res.end(text);
}


// ============================================================
// BOT STATUS
// ============================================================

function isBotRunning() {
    return !!(
        botProcess &&
        botProcess.exitCode === null
    );
}


function getBotStatus() {
    return {
        running: isBotRunning(),
        pid: isBotRunning() ? botProcess.pid : null,
        startedAt: botStartedAt
            ? botStartedAt.toISOString()
            : null
    };
}


// ============================================================
// START BOT
// ============================================================

function startBot() {

    if (isBotRunning()) {
        return {
            success: true,
            message: "Bot is already running",
            pid: botProcess.pid
        };
    }


    if (!fs.existsSync(BOT_FILE)) {
        throw new Error(
            `bot.js not found: ${BOT_FILE}`
        );
    }


    botProcess = spawn(
        process.execPath,
        [BOT_FILE],
        {
            cwd: APP_DIR,

            stdio: [
                "ignore",
                "pipe",
                "pipe"
            ]
        }
    );


    botStartedAt = new Date();


    // BOT OUTPUT
    botProcess.stdout.on("data", data => {

        process.stdout.write(
            `[BOT] ${data}`
        );

    });


    // BOT ERRORS
    botProcess.stderr.on("data", data => {

        process.stderr.write(
            `[BOT ERROR] ${data}`
        );

    });


    // BOT EXIT
    botProcess.on("exit", (code, signal) => {

        console.log(
            `Bot exited. code=${code}, signal=${signal}`
        );

        botProcess = null;
        botStartedAt = null;

    });


    // PROCESS ERROR
    botProcess.on("error", error => {

        console.error(
            "Bot process error:",
            error.message
        );

        botProcess = null;
        botStartedAt = null;

    });


    return {
        success: true,
        message: "Bot started",
        pid: botProcess.pid
    };
}


// ============================================================
// STOP BOT
// ============================================================

function stopBot() {

    if (!isBotRunning()) {

        return {
            success: true,
            message: "Bot is not running"
        };

    }


    const pid = botProcess.pid;


    // Your bot.js already handles SIGINT.
    botProcess.kill("SIGINT");


    return {
        success: true,
        message: "Stop signal sent to bot",
        pid: pid
    };
}


// ============================================================
// SERVER PERFORMANCE
// ============================================================

function formatDuration(seconds) {

    const s = Math.floor(seconds);

    const days = Math.floor(
        s / 86400
    );

    const hours = Math.floor(
        (s % 86400) / 3600
    );

    const minutes = Math.floor(
        (s % 3600) / 60
    );

    const secs = s % 60;


    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}


function getServerStats() {

    const cpus = os.cpus();

    const totalMemory =
        os.totalmem();

    const freeMemory =
        os.freemem();

    const usedMemory =
        totalMemory - freeMemory;


    return {

        hostname: os.hostname(),

        platform: os.platform(),

        uptimeSeconds: os.uptime(),

        uptime: formatDuration(
            os.uptime()
        ),

        cpuCount: cpus.length,

        memory: {

            totalBytes: totalMemory,

            freeBytes: freeMemory,

            usedBytes: usedMemory,

            usedPercent: Number(
                (
                    usedMemory /
                    totalMemory *
                    100
                ).toFixed(2)
            )

        },

        loadAverage: os.loadavg(),

        bot: getBotStatus()

    };
}


// ============================================================
// READ LOG FILE
// ============================================================

function getLogs(lines = 200) {

    if (!fs.existsSync(LOG_PATH)) {

        return "";

    }


    const text =
        fs.readFileSync(
            LOG_PATH,
            "utf8"
        );


    return text
        .split(/\r?\n/)
        .slice(-lines)
        .join("\n");
}


// ============================================================
// SAFE FILE PATH
// ============================================================

function safeScriptPath(name) {

    if (
        typeof name !== "string" ||
        !/^[A-Za-z0-9._-]+\.js$/.test(name) ||
        name.includes("..") ||
        name.includes("/") ||
        name.includes("\\")
    ) {

        throw new Error(
            "Invalid script name"
        );

    }


    return path.join(
        APP_DIR,
        name
    );
}


// ============================================================
// API ROUTES
// ============================================================

async function handleRequest(req, res) {

    const url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );


    const pathname =
        url.pathname;


    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/health"
    ) {

        return sendJson(
            res,
            200,
            {
                success: true,
                service: "Bluebird API",
                time: new Date().toISOString()
            }
        );

    }


    // --------------------------------------------------------
    // BOT STATUS
    // --------------------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/bot/status"
    ) {

        return sendJson(
            res,
            200,
            {
                success: true,
                ...getBotStatus()
            }
        );

    }


    // --------------------------------------------------------
    // RUN BOT
    // --------------------------------------------------------

    if (
        req.method === "POST" &&
        pathname === "/api/bot/run"
    ) {

        try {

            return sendJson(
                res,
                200,
                startBot()
            );

        } catch (error) {

            return sendJson(
                res,
                500,
                {
                    success: false,
                    error: error.message
                }
            );

        }

    }


    // --------------------------------------------------------
    // STOP BOT
    // --------------------------------------------------------

    if (
        req.method === "POST" &&
        pathname === "/api/bot/stop"
    ) {

        return sendJson(
            res,
            200,
            stopBot()
        );

    }


    // --------------------------------------------------------
    // SERVER PERFORMANCE
    // --------------------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/server/stats"
    ) {

        return sendJson(
            res,
            200,
            {
                success: true,
                ...getServerStats()
            }
        );

    }


    // --------------------------------------------------------
    // BOT LOGS
    // --------------------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/bot/logs"
    ) {

        const requestedLines =
            Number(
                url.searchParams.get(
                    "lines"
                ) || 200
            );


        const lines =
            Math.min(
                Math.max(
                    requestedLines,
                    1
                ),
                2000
            );


        return sendJson(
            res,
            200,
            {
                success: true,

                file: LOG_PATH,

                content: getLogs(
                    lines
                )
            }
        );

    }


    // --------------------------------------------------------
    // LIST JAVASCRIPT FILES
    // --------------------------------------------------------

    if (
        req.method === "GET" &&
        pathname === "/api/scripts"
    ) {

        const scripts =
            fs.readdirSync(APP_DIR)
                .filter(
                    name =>
                        name.endsWith(".js")
                )
                .map(name => ({

                    name: name,

                    status:
                        name === "bot.js" &&
                        isBotRunning()
                            ? "Running"
                            : "Stopped"

                }));


        return sendJson(
            res,
            200,
            {
                success: true,
                scripts: scripts
            }
        );

    }


    // --------------------------------------------------------
    // RUN SPECIFIC SCRIPT
    // --------------------------------------------------------

    const runMatch =
        pathname.match(
            /^\/api\/scripts\/([^/]+)\/run$/
        );


    if (
        req.method === "POST" &&
        runMatch
    ) {

        const name =
            decodeURIComponent(
                runMatch[1]
            );


        if (name !== "bot.js") {

            return sendJson(
                res,
                400,
                {
                    success: false,

                    error:
                        "Only bot.js is currently configured as a managed worker"
                }
            );

        }


        try {

            return sendJson(
                res,
                200,
                startBot()
            );

        } catch (error) {

            return sendJson(
                res,
                500,
                {
                    success: false,
                    error: error.message
                }
            );

        }

    }


    // --------------------------------------------------------
    // STOP SPECIFIC SCRIPT
    // --------------------------------------------------------

    const stopMatch =
        pathname.match(
            /^\/api\/scripts\/([^/]+)\/stop$/
        );


    if (
        req.method === "POST" &&
        stopMatch
    ) {

        const name =
            decodeURIComponent(
                stopMatch[1]
            );


        if (name !== "bot.js") {

            return sendJson(
                res,
                400,
                {
                    success: false,

                    error:
                        "Only bot.js is currently configured as a managed worker"
                }
            );

        }


        return sendJson(
            res,
            200,
            stopBot()
        );

    }


    // --------------------------------------------------------
    // READ SCRIPT FILE
    // --------------------------------------------------------

    const fileMatch =
        pathname.match(
            /^\/api\/scripts\/([^/]+)\/file$/
        );


    if (
        req.method === "GET" &&
        fileMatch
    ) {

        try {

            const name =
                decodeURIComponent(
                    fileMatch[1]
                );


            const filePath =
                safeScriptPath(
                    name
                );


            if (
                !fs.existsSync(
                    filePath
                )
            ) {

                return sendJson(
                    res,
                    404,
                    {
                        success: false,
                        error: "File not found"
                    }
                );

            }


            return sendJson(
                res,
                200,
                {
                    success: true,

                    name: name,

                    content:
                        fs.readFileSync(
                            filePath,
                            "utf8"
                        )
                }
            );

        } catch (error) {

            return sendJson(
                res,
                400,
                {
                    success: false,
                    error: error.message
                }
            );

        }

    }


    // --------------------------------------------------------
    // NOT FOUND
    // --------------------------------------------------------

    return sendText(
        res,
        404,
        "API endpoint not found"
    );
}


// ============================================================
// CREATE SERVER
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            try {

                res.setHeader(
                    "Access-Control-Allow-Origin",
                    "*"
                );

                res.setHeader(
                    "Access-Control-Allow-Methods",
                    "GET,POST,OPTIONS"
                );

                res.setHeader(
                    "Access-Control-Allow-Headers",
                    "Content-Type"
                );


                if (
                    req.method === "OPTIONS"
                ) {

                    res.writeHead(
                        204
                    );

                    return res.end();

                }


                await handleRequest(
                    req,
                    res
                );

            } catch (error) {

                console.error(
                    error
                );

                sendJson(
                    res,
                    500,
                    {
                        success: false,
                        error: error.message
                    }
                );

            }

        }
    );


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            `Bluebird API running on http://${HOST}:${PORT}`
        );

        console.log(
            `Application directory: ${APP_DIR}`
        );

        console.log(
            `Bot file: ${BOT_FILE}`
        );

        console.log(
            `Log file: ${LOG_PATH}`
        );

    }
);


// ============================================================
// SHUTDOWN
// ============================================================

function shutdown() {

    console.log(
        "API server shutting down..."
    );


    if (isBotRunning()) {

        try {

            botProcess.kill(
                "SIGINT"
            );

        } catch (error) {

            console.error(
                error.message
            );

        }

    }


    server.close(
        () => process.exit(0)
    );

}


process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);