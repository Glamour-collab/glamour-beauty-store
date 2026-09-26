const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// دالة لتنظيف وتشفير رقم الهاتف بـ SHA256 (مطلوبة لرفع دقة مطابقة تيك توك Advanced Matching)
function hashPhoneNumber(phone) {
    if (!phone) return null;
    // تنظيف الرقم وإزالة أي رموز أو مسافات، والابقاء على الأرقام فقط
    const cleaned = phone.replace(/\D/g, '');
    return crypto.createHash('sha256').update(cleaned).digest('hex');
}

// صفحة الفحص للتأكد أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send('Glamour Beauty Server is Running perfectly!');
});

// مسار استقبال الأحداث من صفحة الهبوط وتمريرها لـ TikTok Events API
app.post('/track', async (req, res) => {
    try {
        const { event, event_id, properties, user } = req.body;

        // إعداد بيانات المستخدم المشفرة (Advanced Matching) لجميع الأحداث (مثل SubmitForm أو غيرها)
        let userData = {};
        if (user && user.phone) {
            const hashedPhone = hashPhoneNumber(user.phone);
            if (hashedPhone) {
                userData.phone = [hashedPhone];
            }
        }

        // بناء حمولة الطلب (Payload) الموجهة إلى تيك توك (تدعم InitiateCheckout, Contact, SubmitForm تلقائياً)
        const tiktokPayload = {
            pixel_code: "DAOL1OBC77U5LL2S3560", // رقم البكسل الخاص بك
            event: event,
            event_id: event_id, // رقم منع التكرار (Deduplication)
            timestamp: new Date().toISOString(),
            context: {
                user: userData,
                ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
                user_agent: req.headers['user-agent']
            },
            properties: properties || {}
        };

        const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
        
        // إذا توفر رمز الوصول، يتم إرسال الحدث لخوادم تيك توك برمجياً
        if (TIKTOK_ACCESS_TOKEN) {
            const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
                method: 'POST',
                headers: {
                    'Access-Token': TIKTOK_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tiktokPayload)
            });

            const result = await response.json();
            console.log('TikTok API Response:', result);
        }

        res.status(200).json({ success: true, message: 'Event tracked successfully via Server' });
    } catch (error) {
        console.error('Server Track Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to process event' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
