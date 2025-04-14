const express = require("express");

const app = express();
app.use(express.json());

const ORIGIN8CARES_UAT_URL = "https://gateway-private.prod.o8cares.com/federated-gql";
const CLIENT_ID = "M7R0ttD3yy9kgjXtHrZBzt47SqnHjex4";
const CLIENT_SECRET = "nB0-AzEW6aHyiqIiZAchkNEsZcC9gjsIeRVuzjfuYzETAdh3JMeKihny4qG4Sg12";

async function getAuthToken() {
    try {
        const response = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: "mutation OauthToken($credentials: OAuthInput!) { oauthToken(credentials: $credentials) { access_token token_type } }",
                variables: { credentials: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } },
                operationName: "OauthToken"
            })
        });
        
        const data = await response.json();
        if (!data.data || !data.data.oauthToken) {
            throw new Error("Invalid Auth Response");
        }
        return data.data.oauthToken.access_token;
    } catch (error) {
        console.error("\n🚨 Error fetching Origin8Cares auth token:", error.message);
        throw new Error("Authentication Failed");
    }
}

app.post("/warm-transfer", async (req, res) => {
    try {
        let { callerId, UUID, state, postalCode } = req.body;

        if (!callerId || !UUID || !state || !postalCode) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        callerId = callerId.replace(/\D/g, "");
        if (callerId.length === 9) callerId = "0" + callerId;
        if (callerId.length !== 10) {
            return res.status(400).json({ error: "Invalid callerId format" });
        }

        console.log(`\n✅ Processing Warm Transfer for Caller ID: ${callerId}, UUID: ${UUID}, State: ${state}`);
        
        const authToken = await getAuthToken();

        console.time("Warm Transfer Request Time");
        const warmTransferRequest = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": UUID
            },
            body: JSON.stringify({
                query: "mutation WarmTransferRequest($warmTransferRequestWarmTransferPayload: WarmTransferPayload) { warmTransferRequest(warmTransferPayload: $warmTransferRequestWarmTransferPayload) { available errorMessage leadReferenceUuid } }",
                variables: {
                    warmTransferRequestWarmTransferPayload: {
                        leadDetails: {
                            ani: callerId,
                            phone: callerId,
                            stateFromAd: state,
                            country: "USA",
                            postalCode: postalCode
                        }
                    }
                },
                operationName: "WarmTransferRequest"
            })
        });
        console.timeEnd("Warm Transfer Request Time");
        
        const warmTransferResponse = await warmTransferRequest.json();
        console.log("\n📥 Warm Transfer Request Response:", JSON.stringify(warmTransferResponse, null, 2));

        const available = warmTransferResponse?.data?.warmTransferRequest?.available || false;
        const leadReferenceUuid = warmTransferResponse?.data?.warmTransferRequest?.leadReferenceUuid || null;

        if (!available || !leadReferenceUuid) {
            console.log("\n❌ No agents available for warm transfer.");
            return res.json({ allowCall: false });
        }

        console.log(`\n✅ Agent Available. Confirming Warm Transfer with Lead UUID: ${leadReferenceUuid}`);

        console.time("Warm Transfer Confirmation Time");
        const warmTransferConfirm = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": leadReferenceUuid
            },
            body: JSON.stringify({
                query: "mutation WarmTransferConfirm($warmTransferConfirmationPayload: WarmTransferConfirmationPayload) { warmTransferConfirm(warmTransferConfirmationPayload: $warmTransferConfirmationPayload) { result } }",
                variables: {
                    warmTransferConfirmationPayload: {
                        leadDetails: {
                            ani: callerId,
                            phone: callerId,
                            stateFromAd: state,
                            country: "USA",
                            postalCode: postalCode
                        },
                        leadReferenceUuid: leadReferenceUuid,
                        transferred: true
                    }
                },
                operationName: "WarmTransferConfirm"
            })
        });
        console.timeEnd("Warm Transfer Confirmation Time");
        
        const confirmResponse = await warmTransferConfirm.json();
        console.log("\n📥 Warm Transfer Confirmation Response:", JSON.stringify(confirmResponse, null, 2));

        const result = confirmResponse?.data?.warmTransferConfirm?.result || "CANCELLED";

        console.log(`\n✅ Warm Transfer Confirmation Result: ${result}`);
        res.json({ allowCall: result === "TRANSFERRED", leadReferenceUuid });
    } catch (error) {
        console.error("\n🚨 Unhandled Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
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



