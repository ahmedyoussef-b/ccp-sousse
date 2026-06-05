import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET(request: NextRequest) {
  try {
    const db = getSQLiteCore();
    const searchParams = request.nextUrl.searchParams;
    const innovationId = searchParams.get('innovationId');
    
    let query = `
      SELECT * FROM innovation_analysis_history 
      WHERE innovation_type = ?
      ORDER BY created_at DESC 
      LIMIT 50
    `;
    
    let innovationType = '';
    switch (innovationId) {
      case '1': innovationType = 'zero_shot'; break;
      case '2': innovationType = 'computer_use'; break;
      case '3': innovationType = 'dual_consensus'; break;
      case '4': innovationType = 'auto_folder'; break;
      case '5': innovationType = 'hybrid_search'; break;
      case '6': innovationType = 'few_shot'; break;
      case '7': innovationType = 'panoramic'; break;
      case '8': innovationType = 'confidence'; break;
      default: innovationType = 'unknown';
    }
    
    const rows = db.getDB().prepare(query).all(innovationType);
    
    const history = rows.map((row: any) => ({
      timestamp: row.created_at,
      success: true,
      result: {
        id: row.id,
        analysis_data: JSON.parse(row.analysis_data || '{}'),
        detected_elements: JSON.parse(row.detected_elements || '[]')
      }
    }));
    
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Erreur history:', error);
    return NextResponse.json({ history: [] });
  }
}