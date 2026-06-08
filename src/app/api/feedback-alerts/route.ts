export const runtime = 'edge';

// src/app/api/feedback-alerts/route.ts
// app/api/feedback-alerts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  rating: number;
  question: string;
  timestamp: string;
  acknowledged: boolean;
}

const getAlertsPath = () => path.join(process.cwd(), 'data', 'training', 'feedback_alerts.json');

function readAlerts(): Alert[] {
  const filePath = getAlertsPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeAlerts(alerts: Alert[]) {
  const filePath = getAlertsPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(alerts, null, 2));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const unacknowledged = searchParams.get('unacknowledged') === 'true';
  
  let alerts = readAlerts();
  
  if (unacknowledged) {
    alerts = alerts.filter(a => !a.acknowledged);
  }
  
  alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  try {
    const { rating, question } = await request.json();
    
    // Créer une alerte si note ≤ 2
    if (rating <= 2) {
      const alert: Alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        type: rating === 1 ? 'critical' : 'warning',
        message: rating === 1 
          ? `⚠️ CRITIQUE: Note ${rating}★ pour "${question.substring(0, 50)}..."`
          : `⚠️ ALERTE: Note ${rating}★ pour "${question.substring(0, 50)}..."`,
        rating,
        question: question.substring(0, 200),
        timestamp: new Date().toISOString(),
        acknowledged: false
      };
      
      const alerts = readAlerts();
      alerts.unshift(alert);
      writeAlerts(alerts);
      
      console.log(`[ALERTES] 🔔 Nouvelle alerte créée: ${alert.message}`);
      
      return NextResponse.json({ alert });
    }
    
    return NextResponse.json({ created: false });
  } catch (error) {
    console.error('[ALERTES] Erreur:', error);
    return NextResponse.json({ error: 'Erreur création alerte' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, acknowledged } = await request.json();
    
    const alerts = readAlerts();
    const alertIndex = alerts.findIndex(a => a.id === id);
    
    if (alertIndex === -1) {
      return NextResponse.json({ error: 'Alerte non trouvée' }, { status: 404 });
    }
    
    alerts[alertIndex].acknowledged = acknowledged;
    writeAlerts(alerts);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ALERTES] Erreur:', error);
    return NextResponse.json({ error: 'Erreur mise à jour' }, { status: 500 });
  }
}