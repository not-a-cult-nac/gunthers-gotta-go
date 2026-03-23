/**
 * Manages HUD and UI elements
 */

import { GameConfig } from './GameConfig.js';

export class UIManager {
    constructor() {
        this.elements = {
            guntherStatus: document.getElementById('gunther-status'),
            enemyCount: document.getElementById('enemy-count'),
            distance: document.getElementById('distance'),
            jeepHealth: document.getElementById('jeep-health-bar'),
            playerHealth: document.getElementById('player-health-bar'),
            guntherSpeech: document.getElementById('gunther-speech'),
            endScreen: document.getElementById('end-screen'),
            endTitle: document.getElementById('end-title'),
            endText: document.getElementById('end-text'),
        };
        
        this.speechTimeout = null;
    }
    
    update(vehicle, gunther, player, enemyManager) {
        // Gunther status
        const statusMap = {
            'in_vehicle': 'IN CAR',
            'wandering': '⚠️ LOOSE!',
            'trapped': '🪤 TRAPPED',
            'carried': '🙌 CARRYING',
            'kidnapped': '❌ KIDNAPPED!',
        };
        this.elements.guntherStatus.textContent = statusMap[gunther.state] || gunther.state;
        this.elements.guntherStatus.style.color = gunther.state === 'in_vehicle' ? '#0f0' : '#ff0';
        
        // Enemy count
        this.elements.enemyCount.textContent = enemyManager.enemies.length;
        
        // Distance to goal
        const remaining = Math.max(0, Math.round(GameConfig.GOAL_Z - vehicle.position.z));
        this.elements.distance.textContent = remaining;
        
        // Health bars
        const jeepPercent = Math.max(0, (vehicle.health / GameConfig.VEHICLE_HEALTH) * 100);
        const playerPercent = Math.max(0, (player.health / GameConfig.PLAYER_HEALTH) * 100);
        
        this.elements.jeepHealth.style.width = `${jeepPercent}%`;
        this.elements.playerHealth.style.width = `${playerPercent}%`;
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
