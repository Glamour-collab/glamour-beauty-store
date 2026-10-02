const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());

// ===============================
// TikTok Configuration
// ===============================

const PIXEL_ID = 'DAOL1OBC77U5LL2S3560';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';

const TIKTOK_EVENTS_API =
    'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// ===============================
// SHA256 - Phone
// ===============================

function hashPhoneNumber(phone) {
    if (!phone) return null;

    const cleaned = String(phone).replace(/\D/g, '');

    if (!cleaned) return null;

    return crypto
        .createHash('sha256')
        .update(cleaned)
        .digest('hex');
}

// ===============================
// Get IP
// ===============================

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }

    return (
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        null
    );
}

// ===============================
// Get Cookie
// ===============================

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';');

    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.trim().split('=');

        if (key === name) {
            return decodeURIComponent(valueParts.join('='));
        }
    }

    return null;
}

// ===============================
// Health Check
// ===============================

app.get('/', (req, res) => {
    res.status(200).send(
        'Glamour Beauty Server is Running perfectly!'
    );
});

// ===============================
// TikTok Events API 2.0
// ===============================

app.post('/track', async (req, res) => {
    try {
        const {
            event,
            event_id,
            properties,
            user,
            ttclid,
            _ttp,
            page
        } = req.body || {};

        // -------------------------------
        // Basic validation
        // -------------------------------

        if (!event) {
            return res.status(400).json({
                success: false,
                error: 'Missing event'
            });
        }

        if (!event_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing event_id'
            });
        }

        if (!TIKTOK_ACCESS_TOKEN) {
            console.error(
                'TIKTOK_ACCESS_TOKEN is missing'
            );

            return res.status(500).json({
                success: false,
                error: 'TikTok access token is not configured'
            });
        }

        // -------------------------------
        // Cookies / attribution
        // -------------------------------

        const cookieTtp =
            getCookie(req, '_ttp');

        const finalTtp =
            _ttp ||
            user?.ttp ||
            cookieTtp ||
            null;

        const finalTtclid =
            ttclid ||
            user?.ttclid ||
            null;

        // -------------------------------
        // User data
        // -------------------------------

        const userData = {};

        // Phone - SHA256
        if (user?.phone) {
            const hashedPhone =
                hashPhoneNumber(user.phone);

            if (hashedPhone) {
                userData.phone = hashedPhone;
            }
        }

        // TikTok cookie
        if (finalTtp) {
            userData.ttp = finalTtp;
        }

        // TikTok Click ID
        if (finalTtclid) {
            userData.ttclid = finalTtclid;
        }

        // IP
        const clientIp = getClientIp(req);

        if (clientIp) {
            userData.ip = clientIp;
        }

        // User Agent
        const userAgent =
            req.headers['user-agent'];

        if (userAgent) {
            userData.user_agent = userAgent;
        }

        // -------------------------------
        // Page information
        // -------------------------------

        const pageUrl =
            page?.url ||
            properties?.url ||
            req.headers.referer ||
            null;

        const pageData = {};

        if (pageUrl) {
            pageData.url = pageUrl;
        }

        // -------------------------------
        // Events API 2.0 payload
        // -------------------------------

        const eventData = {
            event: event,

            // Unix timestamp in seconds
            event_time: Math.floor(
                Date.now() / 1000
            ),

            // Same event_id used by Browser Pixel
            event_id: event_id,

            user: userData,

            properties: properties || {},

            page: pageData
        };

        const tiktokPayload = {
            event_source: 'web',

            event_source_id: PIXEL_ID,

            data: [
                eventData
            ]
        };

        // -------------------------------
        // Safe server logging
        // -------------------------------

        console.log(
            'Sending TikTok Event:',
            JSON.stringify({
                event,
                event_id,
                has_ttclid: !!finalTtclid,
                has_ttp: !!finalTtp,
                has_phone: !!user?.phone,
                has_ip: !!clientIp,
                has_user_agent: !!userAgent,
                page_url: pageUrl
            })
        );

        // -------------------------------
        // Send to TikTok
        // -------------------------------

        const response = await fetch(
            TIKTOK_EVENTS_API,
            {
                method: 'POST',

                headers: {
                    'Access-Token':
                        TIKTOK_ACCESS_TOKEN,

                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify(
                    tiktokPayload
                )
            }
        );

        const result =
            await response.json();

        console.log(
            'TikTok API Response:',
            result
        );

        // -------------------------------
        // TikTok error handling
        // -------------------------------

        if (!response.ok || result.code !== 0) {
            console.error(
                'TikTok API Error:',
                result
            );

            return res.status(502).json({
                success: false,
                error: 'TikTok API rejected the event',
                tiktok_code: result.code,
                tiktok_message: result.message
            });
        }

        // -------------------------------
        // Success
        // -------------------------------

        return res.status(200).json({
            success: true,
            message:
                'Event tracked successfully via TikTok Events API 2.0',
            event,
            event_id
        });

    } catch (error) {

        console.error(
            'Server Track Error:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Failed to process event'
        });
    }
});

// ===============================
// Start Server
// ===============================

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `Server is running on port ${PORT}`
    );
});
