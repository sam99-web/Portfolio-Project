/**
 * documents.js — Routes pour le coffre-fort documentaire
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import db from '../models/db.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Sécurité : extensions autorisées uniquement
const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx',
  '.xls', '.xlsx',
  '.png', '.jpg', '.jpeg',
  '.zip', '.txt',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

// Sécurité : fileFilter — rejette les extensions non autorisées
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé : ${ext}. Extensions acceptées : ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter,
});

// GET /api/documents/dossiers
router.get('/dossiers', (req, res) => {
  try {
    const dossiers = db.prepare('SELECT * FROM dossiers ORDER BY nom ASC').all();
    res.json(dossiers);
  } catch (err) {
    console.error('[GET /dossiers]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/documents/dossiers
router.post('/dossiers', (req, res) => {
  try {
    const { nom, description, parent_id } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom requis' });

    const result = db.prepare(
      'INSERT INTO dossiers (nom, description, parent_id) VALUES (?, ?, ?)'
    ).run(nom, description ?? null, parent_id ?? null);

    const created = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('[POST /dossiers]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/documents/dossiers/:id
router.delete('/dossiers/:id', (req, res) => {
  try {
    const dossier = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    const docs = db.prepare('SELECT * FROM documents WHERE dossier_id = ?').all(req.params.id);
    for (const doc of docs) {
      const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM documents WHERE dossier_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dossiers WHERE id = ?').run(req.params.id);

    res.json({ message: 'Dossier supprimé' });
  } catch (err) {
    console.error('[DELETE /dossiers/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/documents
router.get('/', (req, res) => {
  try {
    const { dossier_id } = req.query;
    const docs = dossier_id === undefined
      ? db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all()
      : dossier_id === 'null'
        ? db.prepare('SELECT * FROM documents WHERE dossier_id IS NULL ORDER BY created_at DESC').all()
        : db.prepare('SELECT * FROM documents WHERE dossier_id = ? ORDER BY created_at DESC').all(dossier_id);
    res.json(docs);
  } catch (err) {
    console.error('[GET /documents]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/documents/upload
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux. Maximum : 50 MB.' });
      }
      return res.status(400).json({ error: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const { dossier_id, description } = req.body;

    const bytes = req.file.size;
    const taille = bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

    const ext = path.extname(req.file.originalname).toLowerCase();
    const typeMap = {
      '.pdf': 'PDF', '.doc': 'Word', '.docx': 'Word',
      '.xls': 'Excel', '.xlsx': 'Excel',
      '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image',
      '.zip': 'Archive', '.txt': 'Texte',
    };
    const type = typeMap[ext] ?? 'Document';

    const result = db.prepare(`
      INSERT INTO documents (nom, nom_fichier, type, taille, statut, description, dossier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.file.originalname,
      req.file.filename,
      type,
      taille,
      'Traité',
      description ?? null,
      dossier_id ? parseInt(dossier_id) : null
    );

    const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('[POST /upload]', err);
    res.status(500).json({ error: "Erreur lors de l'upload", detail: err.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Document supprimé' });
  } catch (err) {
    console.error('[DELETE /documents/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur disque' });

    res.download(filePath, doc.nom);
  } catch (err) {
    console.error('[GET /documents/:id/download]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
