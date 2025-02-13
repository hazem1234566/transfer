const express = require("express");

const app = express();
app.use(express.json());

app.post("/ping", async (req, res) => {
    try {
        let { callerId, UUID } = req.body;

        if (!callerId || !UUID) {
            console.error("❌ Missing callerId or UUID:", req.body);
            return res.status(400).json({ error: "Missing callerId or UUID" });
        }

        callerId = callerId.replace(/\D/g, ""); // Remove non-numeric characters
        if (callerId.length === 9) {
            callerId = "0" + callerId; // Pad with leading zero if needed
        } else if (callerId.length !== 10) {
            console.error("❌ Invalid callerId format:", callerId);
            return res.status(400).json({ error: "Invalid callerId format" });
        }

        console.log(`\n✅ Processed Caller ID: ${callerId}, UUID: ${UUID}`);

        const stoneUrl = `https://eo79okvdbp79y41.m.pipedream.net/?phone=${encodeURIComponent(callerId)}&SMID=MULTIPLAN_TZ.DPLP2_C&UUID=${encodeURIComponent(UUID)}`;

        console.log("\n🚀 Sending Fetch Request to Stonetapert...");
        console.log("🔹 Request URL:", stoneUrl);

        let stoneResponse;
        try {
            const response = await fetch(stoneUrl, {
                method: "GET",
                headers: {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/110.0",
                    "Connection": "keep-alive"
                }
            });

            stoneResponse = await response.text();
            console.log(`\n🔹 Stonetapert Raw Response:`, stoneResponse.trim());
        } catch (err) {
            console.error("\n🚨 Error fetching Stonetapert response:", err.message);
            return res.status(500).json({ error: "Stonetapert API Error" });
        }

        const allowStone = stoneResponse.includes("SendCall");

        let tsqResponse;
        try {
            const response = await fetch(
                "https://tsqe5h7zvl.execute-api.us-west-2.amazonaws.com/prod/getsupression",
                {
                    method: "POST",
                    headers: {
                        "x-api-key": "5MvaUxv3lw4YOU0fETmin4TIOnzXRQAx5cA0bT9c",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ ani: callerId, campaignId: 18114 })
                }
            );
            tsqResponse = await response.json();
            console.log(`\n🔹 TSQ Response:`, tsqResponse);
        } catch (err) {
            console.error("\n🚨 Error fetching TSQ response:", err.message);
            return res.status(500).json({ error: "TSQ API Error" });
        }

        const allowTsq = tsqResponse.accepted === 1;

        const allowCall = allowStone && allowTsq;
        console.log(`\n✅ Final Decision: allowCall=${allowCall}`);

        res.json({ allowCall });

    } catch (error) {
        console.error("\n🚨 Unhandled Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`\n🚀 Server running on port ${PORT}`));
