#!/bin/bash
# Check if a remote is configured, and if so, push any commits
# Posts status to Discord via OpenClaw

export PATH="/home/linuxuser/.nvm/versions/node/v24.14.0/bin:$PATH"
cd /home/linuxuser/projects/ggg

OPENCLAW="/home/linuxuser/.nvm/versions/node/v24.14.0/bin/openclaw"
THREAD="1479335789774241834"

# Check if origin remote exists
if git remote get-url origin &>/dev/null; then
    # Remote exists, try to push
    OUTPUT=$(git push -u origin master 2>&1)
    if [ $? -eq 0 ]; then
        # Notify success and remove cron
        $OPENCLAW message send --channel discord --target "$THREAD" --message "✅ GGG repo pushed to remote successfully! Disabling auto-push cron."
        crontab -l | grep -v "push-if-remote" | crontab -
    else
        $OPENCLAW message send --channel discord --target "$THREAD" --message "⚠️ GGG push failed: $OUTPUT"
    fi
else
    $OPENCLAW message send --channel discord --target "$THREAD" --message "🔄 GGG git check: No remote configured yet. Waiting for David to set one up..."
fi
