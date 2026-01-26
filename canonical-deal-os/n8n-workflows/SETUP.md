# n8n LP Invitation Funnel - Setup Guide

## Overview

This workflow automates the LP invitation process:
1. **Trigger**: Receives webhook when LP invitation is created
2. **Generate Email**: Calls OpenAI to create personalized invitation email
3. **GP Approval**: Creates in-app notification for GP to review/approve
4. **Send Email**: Sends approved email via SendGrid
5. **Reminders**: Schedules follow-up reminders at day 3, 7, 14
6. **Escalation**: Alerts GP if LP doesn't respond after 14 days

---

## Step 1: Configure n8n Environment Variables

In your n8n instance, add these environment variables:

```
BFF_BASE_URL=http://your-bff-server:8787
BFF_N8N_CALLBACK_SECRET=s6MBbexkq8lfnqgYcu0IBPKy24Wbfe9bR7Z/UluVjpg=
```

**For Railway/Cloud deployment:**
- Go to your n8n service settings
- Add environment variables in the Variables section

---

## Step 2: Import the Workflow

### Option A: Import JSON file
1. Open n8n
2. Click **Workflows** > **Import from File**
3. Select `lp-invitation-funnel.json`
4. Click **Save**

### Option B: Create manually
Follow the workflow structure in the JSON file to create nodes manually.

---

## Step 3: Configure BFF Environment

Your `.env` file should have these variables:

```env
# n8n Integration
BFF_N8N_CALLBACK_SECRET=s6MBbexkq8lfnqgYcu0IBPKy24Wbfe9bR7Z/UluVjpg=
BFF_LP_NOTIFICATION_WEBHOOK_HMAC_SECRET=R6ZVqPLRsWiODzdi9SyW1NWneIziHe0fDZ/usXQ8l88=
BFF_LP_NOTIFICATION_WEBHOOK_URL=https://your-n8n-instance.com/webhook/lp-invitation
BFF_PUBLIC_URL=http://localhost:8787
```

**IMPORTANT**: The `BFF_N8N_CALLBACK_SECRET` must match in both n8n and BFF!

---

## Step 4: Get Your n8n Webhook URL

1. Open the imported workflow in n8n
2. Click on the **Webhook: LP Invitation Sent** node
3. Copy the **Production URL** (looks like `https://your-n8n.com/webhook/lp-invitation`)
4. Update `BFF_LP_NOTIFICATION_WEBHOOK_URL` in your `.env` file

---

## Step 5: Activate the Workflow

1. In n8n, open the workflow
2. Toggle the **Active** switch in the top-right
3. The webhook is now listening for events

---

## Step 6: Test the Integration

### Manual Test
```bash
# Create a test LP invitation via API
curl -X POST http://localhost:8787/api/lp/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "dealId": "test-deal-id",
    "lpEmail": "test@example.com",
    "lpEntityName": "Test LP",
    "commitment": 100000,
    "ownershipPct": 5
  }'
```

### Expected Flow
1. BFF sends webhook to n8n
2. n8n generates AI email via `/api/n8n/generate-email`
3. n8n creates GP approval task via `/api/n8n/create-gp-approval-task`
4. GP sees notification in app
5. GP approves email in Email Approval Queue
6. BFF sends `EMAIL_DRAFT_APPROVED` webhook to n8n
7. n8n sends email via `/api/n8n/send-email`

---

## Workflow Diagram

```
[LP Invitation Created]
         |
         v
[Webhook: LP_INVITATION_SENT]
         |
         v
[Generate AI Email] -----> [OpenAI]
         |
         v
[Create GP Approval Task]
         |
         v
[Wait for GP Approval] <--- [GP Approves in UI]
         |
         v
[Send Email via SendGrid]
         |
         v
[Update State: INITIAL]
         |
         v
[Wait 3 Days]
         |
         v
[Check if Accepted]
    /         \
   YES         NO
    |           |
 [Done]    [Day 3 Reminder Flow]
                |
           [Wait 4 more days]
                |
           [Day 7 Reminder Flow]
                |
           [Wait 7 more days]
                |
           [Day 14 Escalation]
                |
           [Expire Invitation]
```

---

## Troubleshooting

### Webhook not receiving events
- Check `BFF_LP_NOTIFICATION_WEBHOOK_URL` is correct
- Verify n8n workflow is activated
- Check n8n execution logs for errors

### HMAC signature errors
- Ensure `BFF_N8N_CALLBACK_SECRET` matches in both systems
- Check that the payload structure matches expected format

### Email not generating
- Verify OpenAI API key is configured in BFF
- Check BFF logs for AI errors

### GP approval not working
- Ensure GP user exists and has correct role
- Check notification was created in database

---

## Security Notes

- **Never commit secrets to git** - Use environment variables
- **HMAC signatures** protect against replay attacks
- **Rotate secrets** periodically
- **Monitor n8n executions** for suspicious activity

---

## Next Steps

After the basic flow works:

1. **Add Day 7 & Day 14 reminder loops** - Extend the workflow
2. **Add SMS via Twilio** - Configure `BFF_TWILIO_*` variables
3. **Build Deal Status workflow** - Similar pattern for deal state changes
