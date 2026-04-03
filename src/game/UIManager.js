/**
 * Manages HUD and UI elements
 */

import { GameConfig } from './GameConfig.js';

export class UIManager {
    constructor() {
        this.elements = {
            guntherStatus: document.getElementById('gunther-status'),
            distance: document.getElementById('distance'),
            jeepHealth: document.getElementById('jeep-health-bar'),
            iPadCharge: document.getElementById('ipad-charge-bar'),
            guntherSpeech: document.getElementById('gunther-speech'),
            endScreen: document.getElementById('end-screen'),
            endTitle: document.getElementById('end-title'),
            endText: document.getElementById('end-text'),
        };

        this.speechTimeout = null;
    }

    update(vehicle, gunther, player, enemyManager, iPadCharge) {
        // Gunther status
        this.elements.guntherStatus.textContent = 'IN CAR';
        this.elements.guntherStatus.style.color = '#0f0';

        // Distance to goal
        const remaining = Math.max(0, Math.round(GameConfig.GOAL_Z - vehicle.position.z));
        this.elements.distance.textContent = remaining;

        // Jeep health bar
        const jeepPercent = Math.max(0, (vehicle.health / GameConfig.VEHICLE_HEALTH) * 100);
        this.elements.jeepHealth.style.width = `${jeepPercent}%`;

        if (jeepPercent < 33) {
            this.elements.jeepHealth.style.background = 'linear-gradient(90deg, #aa0000, #ff0000)';
        } else if (jeepPercent < 66) {
            this.elements.jeepHealth.style.background = 'linear-gradient(90deg, #aaaa00, #ffff00)';
        } else {
            this.elements.jeepHealth.style.background = 'linear-gradient(90deg, #00aa00, #00ff00)';
        }

        // iPad charge bar
        if (iPadCharge !== undefined && this.elements.iPadCharge) {
            const chargePct = Math.max(0, (iPadCharge / GameConfig.IPAD_MAX_CHARGE) * 100);
            this.elements.iPadCharge.style.width = `${chargePct}%`;

            if (chargePct < 25) {
                this.elements.iPadCharge.style.background = 'linear-gradient(90deg, #aa0000, #ff0000)';
            } else if (chargePct < 50) {
                this.elements.iPadCharge.style.background = 'linear-gradient(90deg, #aaaa00, #ffff00)';
            } else {
                this.elements.iPadCharge.style.background = 'linear-gradient(90deg, #00aa00, #00ff00)';
            }
        }
    }

    showSpeech(text, duration = 3000) {
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
        }

        this.elements.guntherSpeech.textContent = text;
        this.elements.guntherSpeech.style.opacity = '1';

        this.speechTimeout = setTimeout(() => {
            this.elements.guntherSpeech.style.opacity = '0';
        }, duration);
    }

    showEndScreen(win, reason) {
        this.elements.endScreen.style.display = 'flex';
        this.elements.endScreen.className = win ? 'win' : 'lose';
        this.elements.endTitle.textContent = win ? 'GUNTHER DELIVERED!' : 'MISSION FAILED';
        this.elements.endText.textContent = reason;
    }
}
