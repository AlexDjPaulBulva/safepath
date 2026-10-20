import { RouteSegment } from './routing';

/**
 * Vygeneruje a stáhne GPX soubor pro danou trasu.
 */
export function exportToGPX(segments: RouteSegment[], routeName: string) {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SafePath App" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${routeName}</name>
  </metadata>
  <trk>
    <name>${routeName}</name>
    <trkseg>
`;

  segments.forEach(segment => {
    segment.coordinates.forEach(coord => {
      // Leaflet používá [lat, lng], GPX vyžaduje lat="" lon=""
      gpx += `      <trkpt lat="${coord[0]}" lon="${coord[1]}"></trkpt>\n`;
    });
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  downloadFile(`${routeName.replace(/\s+/g, '_')}.gpx`, gpx, 'application/gpx+xml');
}

/**
 * Vygeneruje tiskovou sestavu a zavolá nativní tiskový dialog.
 */
export function exportToPrint(routeName: string, safetyScore: number, args: string[]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Pro tisk prosím povolte vyskakovací okna pro tuto stránku.");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tisk Trasy: ${routeName}</title>
      <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; }
        h1 { color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
        .score { font-size: 24px; font-weight: bold; color: ${safetyScore >= 70 ? '#10b981' : safetyScore >= 40 ? '#f59e0b' : '#ef4444'}; }
        .args { margin-top: 30px; }
        .arg-item { margin-bottom: 10px; padding-left: 20px; position: relative; }
        .arg-item::before { content: "•"; position: absolute; left: 0; color: #10b981; font-weight: bold; }
        .footer { margin-top: 50px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <h1>SafePath - Bezpečnostní Karta Trasy</h1>
      <h2>Trasa: ${routeName}</h2>
      <p>Index bezpečí: <span class="score">${safetyScore} / 100</span></p>
      
      <div class="args">
        <h3>Vyhodnocení AI enginem:</h3>
        ${args.map(a => `<div class="arg-item">${a}</div>`).join('')}
      </div>

      <div class="args">
        <h3>Nouzové kontakty na trase:</h3>
        <div class="arg-item">Policie ČR (158)</div>
        <div class="arg-item">Městská policie (156)</div>
      </div>

      <div class="footer">
        Doporučení: Projděte si tuto trasu společně a ukažte dítěti bezpečná místa.<br>
        Vygenerováno aplikací SafePath.
      </div>
      
      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
