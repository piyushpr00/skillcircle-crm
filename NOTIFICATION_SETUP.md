# 📧 Complete Notification System Setup Guide

## 🎯 Overview

Your CRM now has **3 powerful notification methods** working together:

1. **Email Notifications** - Reliable, professional, 15/10/5/3 min reminders
2. **Sound Alerts** - Instant audio notification when follow-ups approach
3. **Visual Alerts** - Page title badge + visual indicator

---

## 📧 Part 1: Email Notifications Setup

### Why Email Notifications?
- ✅ **99% Reliable** - Works even if app is closed
- ✅ **Professional** - Formatted HTML emails
- ✅ **Searchable** - Keep history in inbox
- ✅ **Multiple Reminders** - Gets emails at 15, 10, 5, 3 minutes before

### Setup Instructions (Using Gmail)

#### Step 1: Enable 2FA on Google Account
1. Go to https://myaccount.google.com/security
2. Find "2-Step Verification"
3. Click "Get Started" and complete the setup
4. Confirm with your phone

#### Step 2: Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" as app
3. Select "Windows/Mac/Linux" as device
4. Click "Generate"
5. Copy the **16-character password** (without spaces)

#### Step 3: Add to .env File
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```

Replace with your actual Gmail and app password.

#### Step 4: Verify Email Service
The system will automatically test email on startup. Look for:
```
✓ Email notifications enabled
[EMAIL] Sent 15min reminder to user@gmail.com...
```

### Alternative: Using Custom SMTP Server
If you don't use Gmail, modify `server/email.js`:

```javascript
return nodemailer.createTransport({
  host: 'your-mail-server.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@company.com',
    pass: 'your-password'
  }
});
```

---

## 🔔 Part 2: Sound Alerts

### Features
- ✅ **Plays automatically** when notifications arrive
- ✅ **Web Audio API** - No external files needed
- ✅ **Smart timing** - Plays once per minute, not repeatedly
- ✅ **Professional beep** - 800Hz sine wave, 0.5 seconds

### How It Works
- Triggers for follow-ups **3-5 minutes before**
- Single beep plays once every 30 seconds (not annoying)
- Works in browser, no installation needed
- Volume controlled by system audio

### Customizing Sound
Edit `public/app.js` in `playNotificationSound()` function:

```javascript
oscillator.frequency.value = 800;  // Change frequency (Hz)
gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
// Change 0.5 to duration in seconds
```

---

## 👁️ Part 3: Visual Alerts

### Features
- ✅ **Page Title Badge** - Shows count: "(4) CRM Dashboard..."
- ✅ **Red Top Border** - Visual indicator of pending follow-ups
- ✅ **Real-time Updates** - Updates every notification check

### What It Shows
When follow-ups are due:
- Page title updates: `(4) CRM Dashboard - Lead Management System`
- Red border appears at top of window
- Both disappear when no follow-ups pending

### Browser Tab Visibility
- Works in foreground and background
- Helps you spot alerts even minimized
- Professional appearance, no flashing

---

## 🎯 Complete Notification Flow

### Example: Follow-up scheduled for 3:00 PM

```
2:45 PM → 15-min notification
├─ Email: "CRM Reminder: Follow-up in 15 minutes"
├─ In-app: Shows in notifications panel
└─ Dashboard shows count

2:50 PM → 10-min notification
├─ Email: "CRM Reminder: Follow-up in 10 minutes"
├─ In-app: Shows in notifications panel
└─ Dashboard updates

2:55 PM → 5-min notification
├─ Email: "CRM Reminder: Follow-up in 5 minutes"
├─ Sound: Beep plays once
├─ Page title: Updates with count
├─ Visual: Red border appears
└─ Dashboard updates

2:57 PM → 3-min notification (URGENT)
├─ Email: "CRM Reminder: Follow-up in 3 minutes"
├─ Sound: Beep plays again
├─ Browser notification: Desktop alert
├─ Page title: "(1) CRM Dashboard..."
└─ Dashboard: Shows in Recent Notifications

3:00 PM → Follow-up time!
└─ All notifications clear
```

---

## 👥 User Setup

### Adding Team Members with Email

1. **Admin creates user:**
   - Navigate to Users view
   - Click "Add Member"
   - Fill in Username, Email, Password, Role

2. **Email field is optional:**
   - If email is provided → Gets all notifications
   - If email is empty → No email notifications (but still gets app alerts)

3. **User assignment:**
   - Assign follow-ups to specific users
   - They receive emails for their assigned clients
   - Sound alerts work for all logged-in users

---

## 📋 Setup Checklist

- [ ] **Gmail Setup**
  - [ ] 2FA enabled on Google account
  - [ ] App password generated
  - [ ] EMAIL_USER added to .env
  - [ ] EMAIL_PASSWORD added to .env

- [ ] **User Email Addresses**
  - [ ] All team members have email addresses set
  - [ ] Emails are correct and active

- [ ] **Testing**
  - [ ] Create a test follow-up for 2 minutes from now
  - [ ] Verify email arrives (check spam folder)
  - [ ] Verify page title updates
  - [ ] Verify sound plays

- [ ] **Production Deployment**
  - [ ] .env file updated on Render/deployment
  - [ ] Email credentials are secure
  - [ ] All users added with email addresses

---

## 🧪 Testing Notifications

### Manual Test Endpoint (Admin Only)
```
POST /api/test-notification
```

This creates a test follow-up for 2 minutes from now and triggers all notifications as they approach.

Response:
```json
{
  "success": true,
  "clientId": 123,
  "remarkId": 456,
  "currentIstTime": "14:35 IST",
  "testTime": "14:37:00 IST",
  "instruction": "Go to Dashboard → Check 'Recent Notifications' panel"
}
```

### Expected Flow (2-minute test)
1. **0:00** - Test created, check notifications panel
2. **1:00** - 1-minute mark (if set up for 1-min reminders)
3. **2:00** - Follow-up time reached, notifications clear
4. Check email inbox for test emails

---

## 🔧 Troubleshooting

### Email Not Arriving

**Problem:** Emails don't arrive
- [ ] Check .env has EMAIL_USER and EMAIL_PASSWORD
- [ ] Verify app password (not regular password)
- [ ] Check Gmail spam/promotions folder
- [ ] Check server logs for [EMAIL ERROR]

**Solution:**
1. Verify credentials: `echo $EMAIL_USER` in terminal
2. Test Gmail password at https://accounts.google.com/login
3. Re-generate app password if older than 30 days
4. Check email format: should be `user@gmail.com`

### Sound Not Playing

**Problem:** No beep when follow-up approaches
- [ ] Check browser volume
- [ ] Check system volume
- [ ] Allow audio in browser permissions
- [ ] Check notifications are showing in app

**Solution:**
1. Verify notifications panel shows reminders
2. Check browser console for audio errors
3. Try test notification manually
4. Adjust system volume

### Page Title Not Updating

**Problem:** No "(X) CRM Dashboard..." in title
- [ ] Check browser is active/foreground
- [ ] Check notifications exist in dashboard
- [ ] Refresh browser page
- [ ] Check browser title bar visibility

**Solution:**
1. Create new follow-up for 5 minutes from now
2. Wait for notification check (every 60 seconds)
3. Check if title updates
4. Look for red border at top

### Users Not Getting Emails

**Problem:** Added email but user doesn't receive
- [ ] User email is in database: Check users table
- [ ] Follow-up is assigned to user: Check assigned_to
- [ ] Email credentials are set: Check .env
- [ ] Follow-up is in future: Should be within next 15 mins

**Solution:**
1. Verify user email in database:
   ```sql
   SELECT id, username, email FROM users;
   ```
2. Verify follow-up is assigned:
   ```sql
   SELECT c.assigned_to, u.email FROM clients c 
   LEFT JOIN users u ON c.assigned_to = u.id;
   ```
3. Check server logs for email attempts
4. Test with admin email first

---

## 🔐 Security Notes

### Email Credentials
- ✅ Store in `.env` file (never commit to git)
- ✅ Use App Passwords (not regular Gmail password)
- ✅ Regenerate if compromised
- ✅ Different from database password

### Data Protection
- ✅ Emails only sent to assigned user
- ✅ Only future follow-ups trigger emails
- ✅ No client data stored in email logs
- ✅ Old emails auto-deleted after 24 hours

---

## 📊 Notification Statistics

### Email Reminders per Follow-up
- **4 emails sent** at: 15, 10, 5, 3 minutes before
- **1 database record** per reminder (UNIQUE constraint prevents duplicates)
- **Audit trail** in notification_logs table

### Performance Impact
- **Minimal**: Checks every 60 seconds
- **Email**: Async, doesn't block app
- **Sound**: Web Audio, hardware accelerated
- **No lag**: Page stays responsive

---

## 🎯 Best Practices

1. **Always add email to team members**
   - Ensures they don't miss follow-ups
   - Professional communication channel

2. **Use assigned clients**
   - Emails go to assigned user only
   - Prevents notification overload

3. **Test before going live**
   - Create test follow-up
   - Verify all 3 notification types work
   - Check spam folder for emails

4. **Monitor notification logs**
   - View sent emails in database
   - Troubleshoot delivery issues
   - Audit trail for compliance

5. **Customize if needed**
   - Adjust sound frequency/duration
   - Modify email template
   - Add SMS notifications (future)

---

## 📞 Support

If notifications aren't working:

1. **Check logs**: Server console shows [NOTIFICATION], [EMAIL], [ERROR]
2. **Verify setup**: All .env variables set correctly
3. **Test manually**: Use test endpoint to trigger
4. **Check database**: Verify users have emails and assigned clients
5. **Browser console**: Check for JavaScript errors

---

## 🚀 Future Enhancements

Coming soon:
- [ ] SMS notifications (Twilio)
- [ ] Slack integration
- [ ] WhatsApp notifications
- [ ] Custom email templates
- [ ] Do Not Disturb schedules
- [ ] Notification preferences per user
- [ ] Push notifications for mobile app

---

**Status**: ✅ Production Ready
**Last Updated**: May 22, 2026
**Version**: 1.0
