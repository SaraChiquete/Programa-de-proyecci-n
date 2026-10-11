const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(os.tmpdir(), 'spaRV1909_usfm');
const ZIP_PATH = path.join(os.tmpdir(), 'spaRV1909_usfm.zip');
const OUTPUT_PATH = path.join(ROOT, 'rv1909.json');
const SOURCE_URL = 'https://eBible.org/Scriptures/spaRV1909_usfm.zip';

const BOOK_NAME_MAP = {
  GEN: 'Génesis', EXO: 'Éxodo', LEV: 'Levítico', NUM: 'Números', DEU: 'Deuteronomio',
  JOS: 'Josué', JDG: 'Jueces', RUT: 'Rut', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Reyes', '2KI': '2 Reyes', '1CH': '1 Crónicas', '2CH': '2 Crónicas',
  EZR: 'Esdras', NEH: 'Nehemías', EST: 'Ester', JOB: 'Job', PSA: 'Salmos', PRO: 'Proverbios',
  ECC: 'Eclesiastés', SNG: 'Cantar de los Cantares', ISA: 'Isaías', JER: 'Jeremías',
  LAM: 'Lamentaciones', EZK: 'Ezequiel', DAN: 'Daniel', HOS: 'Oseas', JOL: 'Joel',
  AMO: 'Amós', OBA: 'Abdías', JON: 'Jonás', MIC: 'Miqueas', NAM: 'Nahúm', HAB: 'Habacuc',
  ZEP: 'Sofonías', HAG: 'Hageo', ZEC: 'Zacarías', MAL: 'Malaquías', MAT: 'Mateo',
  MRK: 'Marcos', LUK: 'Lucas', JHN: 'Juan', ACT: 'Hechos', ROM: 'Romanos', '1CO': '1 Corintios',
  '2CO': '2 Corintios', GAL: 'Gálatas', EPH: 'Efesios', PHP: 'Filipenses', COL: 'Colosenses',
  '1TH': '1 Tesalonicenses', '2TH': '2 Tesalonicenses', '1TI': '1 Timoteo', '2TI': '2 Timoteo',
  TIT: 'Tito', PHM: 'Filemón', HEB: 'Hebreos', JAS: 'Santiago', '1PE': '1 Pedro', '2PE': '2 Pedro',
  '1JN': '1 Juan', '2JN': '2 Juan', '3JN': '3 Juan', JUD: 'Judas', REV: 'Apocalipsis'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode} while downloading ${url}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.rmSync(dest, { force: true });
      reject(err);
    });
  });
}

function extractZip(zipPath, destinationDir) {
  ensureDir(destinationDir);
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destinationDir}' -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destinationDir], { stdio: 'inherit' });
  }
}

function toPlainText(rawText) {
  return rawText
    .replace(/\\[A-Za-z0-9-]+[*]?/g, ' ')
    .replace(/\|strong="[^"]*"/g, '')
    .replace(/\\[A-Za-z0-9-]+\s*\*?/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function getBookCodeFromFilename(fileName) {
  const match = fileName.match(/(?:^|[-_])([A-Z0-9]+)spaRV1909\.usfm$/i);
  return match ? match[1].toUpperCase() : null;
}

function parseUsfmFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const code = getBookCodeFromFilename(path.basename(filePath));
  const bookName = BOOK_NAME_MAP[code] || code || 'Libro';

  const chapters = [];
  let currentChapter = 0;
  let currentVerse = null;
  let currentLine = '';

  for (const line of raw.split(/\r?\n/)) {
    const chapterMatch = line.match(/^\\c\s+(\d+)/);
    if (chapterMatch) {
      currentChapter = Number(chapterMatch[1]);
      if (!chapters[currentChapter - 1]) chapters[currentChapter - 1] = [];
      continue;
    }

    const verseMatch = line.match(/^\\v\s+(\d+)\s*(.*)$/);
    if (verseMatch) {
      const verseNo = Number(verseMatch[1]);
      const verseText = toPlainText(verseMatch[2]);
      if (!chapters[currentChapter - 1]) chapters[currentChapter - 1] = [];
      currentVerse = verseNo;
      if (verseText) chapters[currentChapter - 1].push(verseText);
      currentLine = verseText;
      continue;
    }

    if (currentChapter > 0 && currentVerse !== null && line.trim() && !line.trim().startsWith('\\')) {
      const paragraphText = toPlainText(line);
      if (paragraphText) {
        const arr = chapters[currentChapter - 1];
        if (arr && arr.length) {
          arr[arr.length - 1] = `${arr[arr.length - 1]} ${paragraphText}`.trim();
        }
      }
    }
  }

  return { name: bookName, chapters: chapters.map((chapter) => chapter.filter(Boolean)) };
}

async function main() {
  ensureDir(TEMP_DIR);
  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`Descargando ${SOURCE_URL}...`);
    await downloadFile(SOURCE_URL, ZIP_PATH);
  }

  if (!fs.existsSync(path.join(TEMP_DIR, '02-GENspaRV1909.usfm'))) {
    console.log('Extrayendo archivos USFM...');
    extractZip(ZIP_PATH, TEMP_DIR);
  }

  const files = fs.readdirSync(TEMP_DIR)
    .filter((name) => /\.usfm$/i.test(name))
    .sort((a, b) => {
      const pa = Number((a.match(/^(\d+)/) || [0, 0])[1]);
      const pb = Number((b.match(/^(\d+)/) || [0, 0])[1]);
      return pa - pb;
    });

  const books = files.map((fileName) => parseUsfmFile(path.join(TEMP_DIR, fileName)));

  const result = {
    code: 'RV1909',
    name: 'Reina-Valera 1909',
    books,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf8');

  const totalBooks = books.length;
  const joan = books.find((b) => b.name === 'Juan');
  const juan3 = joan && joan.chapters[2];
  const juan316 = juan3 && juan3[15];

  console.log(`Archivo generado: ${OUTPUT_PATH}`);
  console.log(`Libros: ${totalBooks}`);
  console.log(`Juan capítulos: ${joan ? joan.chapters.length : 0}`);
  console.log(`Juan 3:16: ${juan316 || 'no encontrado'}`);

  if (totalBooks !== 66) throw new Error(`Se esperaban 66 libros y se generaron ${totalBooks}.`);
  if (!joan || joan.chapters.length !== 21) throw new Error('Juan no tiene 21 capítulos.');
  if (!juan3 || juan3.length !== 36) throw new Error('Juan 3 no tiene 36 versículos.');
  if (!juan316 || !juan316.includes('Porque de tal manera amó Dios al mundo')) {
    throw new Error('No se encontró el texto esperado de Juan 3:16.');
  }

  console.log('Validación OK.');
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
