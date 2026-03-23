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
            guntherIndicator: document.getElementById('gunther-indicator'),
            guntherArrow: document.getElementById('gunther-arrow'),
            guntherDist: document.getElementById('gunther-dist'),
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
        
        // Gunther direction indicator (when not in vehicle)
        if (gunther.state !== 'in_vehicle' && this.elements.guntherIndicator) {
            this.elements.guntherIndicator.style.display = 'block';
            
            // Calculate direction from vehicle to Gunther
            const dx = gunther.position.x - vehicle.position.x;
            const dz = gunther.position.z - vehicle.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            // Angle relative to vehicle facing direction
            const targetAngle = Math.atan2(dx, dz);
            const relAngle = targetAngle - vehicle.rotation;
            
            // Convert to arrow character
            let arrow = '⬆';
            const normalized = ((relAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            if (normalized > Math.PI * 7/8 && normalized < Math.PI * 9/8) arrow = '⬇';
            else if (normalized > Math.PI * 5/8 && normalized <= Math.PI * 7/8) arrow = '↙';
            else if (normalized > Math.PI * 3/8 && normalized <= Math.PI * 5/8) arrow = '⬅';
            else if (normalized > Math.PI * 1/8 && normalized <= Math.PI * 3/8) arrow = '↖';
            else if (normalized > Math.PI * 15/8 || normalized <= Math.PI * 1/8) arrow = '⬆';
            else if (normalized > Math.PI * 13/8 && normalized <= Math.PI * 15/8) arrow = '↗';
            else if (normalized > Math.PI * 11/8 && normalized <= Math.PI * 13/8) arrow = '➡';
            else if (normalized > Math.PI * 9/8 && normalized <= Math.PI * 11/8) arrow = '↘';
            
            this.elements.guntherArrow.textContent = arrow;
            this.elements.guntherDist.textContent = `GUNTHER: ${Math.round(dist)}m`;
            
            // Color based on danger
            const color = gunther.state === 'kidnapped' ? '#ff0000' : '#ffcc00';
            this.elements.guntherIndicator.style.color = color;
        } else if (this.elements.guntherIndicator) {
            this.elements.guntherIndicator.style.display = 'none';
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
