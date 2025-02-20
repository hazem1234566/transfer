const express = require("express");

const app = express();
app.use(express.json());

/**
 * 🟢 Existing `/ping` Endpoint (Stonetapert + SQ)
 */
app.post("/ping", async (req, res) => {
    try {
        let { callerId, UUID } = req.body;

        if (!callerId || !UUID) {
            console.error("❌ Missing callerId or UUID:", req.body);
            return res.status(400).json({ error: "Missing callerId or UUID" });
        }

        callerId = callerId.replace(/\D/g, "");
        if (callerId.length === 9) {
            callerId = "0" + callerId;
        } else if (callerId.length !== 10) {
            console.error("❌ Invalid callerId format:", callerId);
            return res.status(400).json({ error: "Invalid callerId format" });
        }

        console.log(`\n✅ Processed Caller ID: ${callerId}, UUID: ${UUID}`);

        const stoneUrl = `https://eo79okvdbp79y41.m.pipedream.net/?phone=${encodeURIComponent(callerId)}&SMID=MULTIPLAN_TZ.DPLP2_C&UUID=${encodeURIComponent(UUID)}`;

        console.log("\n🚀 Sending Fetch Request to Stonetapert...");

        let allowStone = false;
        try {
            const response = await fetch(stoneUrl);
            const stoneResponse = await response.text();
            allowStone = stoneResponse.includes("SendCall");
        } catch (err) {
            console.error("\n🚨 Error fetching Stonetapert response:", err.message);
            return res.status(500).json({ error: "Stonetapert API Error" });
        }

        let allowTsq = false;
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
            const tsqResponse = await response.json();
            allowTsq = tsqResponse.accepted === 1;
        } catch (err) {
            console.error("\n🚨 Error fetching TSQ response:", err.message);
            return res.status(500).json({ error: "TSQ API Error" });
        }

        const allowCall = allowStone && allowTsq;
        console.log(`\n✅ Final Decision: allowCall=${allowCall}`);

        res.json({ allowCall });

    } catch (error) {
        console.error("\n🚨 Unhandled Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * 🟢 New `/ping-peakplans` Endpoint (Peak Plans + SQ)
 */
app.post("/ping-peakplans", async (req, res) => {
    try {
        let { callerId, UUID, state } = req.body;

        if (!callerId || !UUID || !state || state.length !== 2) {
            console.error("❌ Missing or invalid callerId, UUID, or state:", req.body);
            return res.status(400).json({ error: "Missing or invalid callerId, UUID, or state" });
        }

        callerId = callerId.replace(/\D/g, "");
        if (callerId.length === 9) {
            callerId = "0" + callerId;
        } else if (callerId.length !== 10) {
            console.error("❌ Invalid callerId format:", callerId);
            return res.status(400).json({ error: "Invalid callerId format" });
        }

        console.log(`\n✅ Processed Caller ID: ${callerId}, UUID: ${UUID}, State: ${state}`);

        const peakPlansUrl = `https://api.convoso.com/v1/agent-monitor/search?auth_token=gw9eaix764zsvtf15781wahcf7j1rrrx&campaign_id=2331&queue_id=&user_id=&filter_by_skill_options=${state}`;

        console.log("\n🚀 Sending Fetch Request to Peak Plans...");

        let allowPeakPlans = false;
        try {
            const response = await fetch(peakPlansUrl);
            const data = await response.json();
            allowPeakPlans = data.success && data.data?.available_agents > 0;
        } catch (err) {
            console.error("\n🚨 Error fetching Peak Plans response:", err.message);
            return res.status(500).json({ error: "Peak Plans API Error" });
        }

        let allowTsq = false;
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
            const tsqResponse = await response.json();
            allowTsq = tsqResponse.accepted === 1;
        } catch (err) {
            console.error("\n🚨 Error fetching TSQ response:", err.message);
            return res.status(500).json({ error: "TSQ API Error" });
        }

        const allowCall = allowPeakPlans && allowTsq;
        console.log(`\n✅ Final Decision: allowCall=${allowCall}`);

        res.json({ allowCall });

    } catch (error) {
        console.error("\n🚨 Unhandled Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`\n🚀 Server running on port ${PORT}`));
