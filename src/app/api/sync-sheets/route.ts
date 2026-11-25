import { NextRequest, NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const SHEET_TO_COLLECTION: Record<string, string> = {
  MASTER: "violations",
  PRESENSI_FILTER: "attendance",
  REKAP_PRESENSI_PERMANEN: "permanent_absences",
  DATA_KONSELING: "counseling",
  ROMBEL: "rombel",
  MASTER_KELAS: "master_kelas",
  Sheet27: "klasemen_kelas",
  "REKAP POIN 2025-2026": "rekap_poin_2025_2026",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.token !== process.env.SYNC_SECRET_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collectionName = SHEET_TO_COLLECTION[body.sheetName];
    if (!collectionName || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Sheet tidak didukung" }, { status: 400 });
    }

    const db = getAdminDb();
    const batch = db.batch();

    body.rows.forEach((row: Record<string, unknown>, idx: number) => {
      const docId = `${body.sheetName.replace(/\s+/g, "_")}_row_${row._rowNumber ?? idx + 2}`;
      const docRef = db.collection(collectionName).doc(docId);
      batch.set(
        docRef,
        { ...row, updatedAt: body.syncedAt || new Date().toISOString() },
        { merge: true }
      );
    });

    await batch.commit();
    return NextResponse.json({
      success: true,
      collection: collectionName,
      totalSynced: body.rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
