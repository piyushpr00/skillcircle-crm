# 🔔 CRM Notification System Guide

## Overview

Your CRM now includes an intelligent **multi-channel notification system** that automatically alerts you about upcoming follow-ups at critical times.

### Key Features
- ✅ **Automatic Reminders**: Notifications sent 5 minutes and 3 minutes before follow-ups
- ✅ **Real-time Tracking**: Dashboard updates with recent notifications
- ✅ **Browser Alerts**: Push notifications on supported browsers
- ✅ **Persistent Logging**: All notifications stored for auditing
- ✅ **Smart Scheduling**: Background job checks every minute
- ✅ **No Setup Required**: Works automatically once you create follow-ups

---

## How It Works

### 1. **Backend Notification Scheduler**

A background service runs continuously and:
- Checks for upcoming follow-ups every **60 seconds**
- Identifies follow-ups due in **3 minutes** and **5 minutes**
- Records each notification in the database
- Prevents duplicate notifications using unique constraints

**Files Involved:**
- `server/notifications.js` - Notification service logic
- Database tables: `notifications`, `notification_logs`

### 2. **Frontend Notification Display**

The dashboard automatically:
- Fetches recent notifications every **60 seconds**
- Displays notifications in the "Recent Notifications" panel
- Shows client name, time window, and alert message
- Updates in real-time without page refresh

**Files Involved:**
- `public/app.js` - Notification fetching and display
- `public/index.html` - Notification panel UI
- `public/style.css` - Notification styling

---

## Using the Notification System

### Step 1: Create a Follow-up

1. Open your CRM dashboard: **https://dashboard-rho-cyan-34.vercel.app**
2. Navigate to **Clients** tab
3. Click on a client to view details
4. In the **Remarks** section, click **Add Remark**
5. Enter:
   - **Remark**: Your note (e.g., "Send proposal")
   - **Follow-up Date**: Today or future date

Example:
```
Client: TechCorp Solutions
Remark: Follow up on proposal review
Follow-up Date: 2026-05-22
```

### Step 2: Receive Notifications

**Automatic notifications will be sent:**
- **5 minutes before**: Initial alert
- **3 minutes before**: Final reminder

### Step 3: View Dashboard Notifications

The **"Recent Notifications"** panel shows:
- ✓ Client name
- ✓ Time window (3 min before / 5 min before)
- ✓ Full alert message

Example:
```
TechCorp Solutions
3min before
Follow-up for TechCorp Solutions: Send proposal
```

### Step 4: Enable Browser Alerts (Optional)

1. Visit the CRM dashboard
2. Click **"Allow"** when prompted for notification permissions
3. Browser will show push notifications for critical alerts (3 min before)

---

## Notification Timeline Example

**Follow-up scheduled for 2:00 PM today:**

```
1:55 PM  → 5 MIN BEFORE notification sent
         → Dashboard shows alert
         → Browser notification (if enabled)

1:57 PM  → 3 MIN BEFORE notification sent
         → Dashboard shows alert
         → Browser notification (if enabled)

2:00 PM  → Follow-up time!
         → Act on the follow-up
```

---

## Notification Database Tables

### `notifications` Table
Tracks which reminders have been sent:
- `remark_id`: Links to the reminder
- `minutes_before`: 5 or 3 minutes
- `sent_at`: When the notification was sent

### `notification_logs` Table
Historical record of all notifications:
- `remark_id`: Links to the reminder
- `client_name`: Client name at time of notification
- `minutes_before`: 5 or 3
- `message`: Full notification text
- `timestamp`: When sent

---

## API Endpoints

### Get Recent Notifications
```bash
GET /api/notifications
Authorization: Bearer <token>

Response:
[
  {
    "id": 1,
    "remark_id": 5,
    "client_name": "TechCorp Solutions",
    "minutes_before": 5,
    "message": "Follow-up for TechCorp Solutions: Send proposal",
    "timestamp": "2026-05-22T11:55:00.000Z"
  },
  ...
]
```

---

## Notification Behavior

### ✅ What Gets Notified
- ✓ All follow-ups scheduled for **today**
- ✓ Sent at exactly 5 minutes and 3 minutes before
- ✓ Only if follow_up_date is set

### ❌ What Doesn't Get Notified
- ✗ Future follow-ups (tomorrow, next week)
- ✗ Remarks without a follow-up date
- ✗ Deleted remarks or clients

### Auto-Cleanup
- Notification logs older than **24 hours** are automatically cleaned up
- Keeps database lean while maintaining audit trail

---

## Troubleshooting

### Notifications Not Showing?

**Check 1: Is follow-up for today?**
- Only today's follow-ups trigger notifications
- Check the follow-up date in the remark

**Check 2: Dashboard notifications panel**
- Refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Check the "Recent Notifications" panel
- Wait 60 seconds for the scheduler to run

**Check 3: Browser notifications**
- Go to browser settings and allow notifications for the domain
- Ensure notifications are not muted

### No Notifications After 3 Minutes?
- Log in and refresh the dashboard
- Notifications are only sent within 3-5 minute window
- If past 3 minutes before follow-up, notifications won't trigger

### Dashboard Panel is Empty?
- This is normal if no follow-ups were in the 3-5 minute window
- Navigate to "Follow-ups" tab to see all upcoming items
- Notifications appear temporarily when within the alert window

---

## Best Practices

1. **Set Realistic Follow-ups**
   - Don't schedule follow-ups more than a few minutes ahead
   - System is optimized for same-day follow-ups

2. **Enable Browser Notifications**
   - Click "Allow" when prompted
   - Get desktop alerts even if tab is not active

3. **Check Dashboard Regularly**
   - Refresh periodically to see notifications
   - Dashboard updates every 60 seconds automatically

4. **Review Follow-up History**
   - Check "Follow-ups" tab for all scheduled items
   - See completed and pending tasks

5. **Use Remarks Effectively**
   - Clear, actionable remarks
   - Include client name, action, and any relevant details

---

## Technical Details

### Notification Scheduler
- **Interval**: Every 60 seconds
- **Timezone**: Server timezone (UTC)
- **Scope**: Checks only today's follow-ups
- **Concurrency**: Handles multiple follow-ups simultaneously

### Notification Windows
- **5-minute warning**: Initial heads-up
- **3-minute warning**: Final reminder before deadline
- Both notifications sent regardless of user online status

### Data Retention
- Notifications older than 24 hours archived/deleted
- Keeps database clean while maintaining audit trail
- Full logs available for compliance

---

## Configuration

If you need to adjust notification timing:

Edit `server/notifications.js`:
```javascript
const NOTIFICATION_MINUTES = [5, 3]; // Change these values
// Example: [10, 5, 1] for 10, 5, and 1 minute warnings
```

Then redeploy the application.

---

## Example Workflow

### Sales Team Scenario

**9:00 AM** - Morning meeting, identify 5 follow-ups needed today
- Create remarks for each client
- Set follow-up date to today at specific times

**11:55 AM** - First notifications arrive
- Dashboard shows "5 min before" alerts
- Team gets browser notifications
- Sales rep checks client details

**11:57 AM** - Final reminder
- "3 min before" notifications
- Team ready to execute follow-up

**12:00 PM** - Follow-up time!
- Contact client
- Update notes in dashboard

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify follow-up dates are set to today
3. Ensure browser notifications are allowed
4. Check dashboard "Follow-ups" tab for complete view

---

**Your notification system is now active and monitoring all follow-ups!** 🚀

