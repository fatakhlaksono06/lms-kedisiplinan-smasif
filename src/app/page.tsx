"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  HUKUMAN_PEMANGGILAN,
  HUKUMAN_PEMBINAAN,
  KELAS_PUTRA,
  KELAS_PUTRI,
  KEPALA_SEKOLAH,
  PIN_KONSELING,
  WAKA_KESISWAAN,
} from "@/lib/constants";

type GenericRow = Record<string, unknown>;

function pickValue(row: GenericRow, keys: string[]): string {
  for (const key of keys) {
    const foundKey = Object.keys(row).find(
      (k) => k.toLowerCase().trim() === key.toLowerCase().trim()
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      const str = String(row[foundKey]).trim();
      if (str !== "") return str;
    }
  }
  return "";
}

function pickNumber(row: GenericRow, keys: string[]): number | null {
  const raw = pickValue(row, keys);
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const kelasParam = searchParams.get("kelas")?.trim() || "";

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "violations" | "attendance" | "counseling" | "reports"
  >("dashboard");
  const [selectedClass, setSelectedClass] = useState<string>(kelasParam);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [violations, setViolations] = useState<GenericRow[]>([]);
  const [attendance, setAttendance] = useState<GenericRow[]>([]);
  const [permanentAbsences, setPermanentAbsences] = useState<GenericRow[]>([]);
  const [counseling, setCounseling] = useState<GenericRow[]>([]);
  const [rombel, setRombel] = useState<GenericRow[]>([]);

  const [counselingUnlocked, setCounselingUnlocked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");

  useEffect(() => {
    setSelectedClass(kelasParam);
  }, [kelasParam]);

  useEffect(() => {
    let active = true;
    async function loadFirestoreData() {
      setLoading(true);
      setErrorMsg("");
      try {
        const fetchCollection = async (name: string) => {
          const snap = await getDocs(query(collection(db, name), limit(500)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        };

        const [violData, attData, permData, counsData, rombelData] =
          await Promise.all([
            fetchCollection("violations"),
            fetchCollection("attendance"),
            fetchCollection("permanent_absences"),
            fetchCollection("counseling"),
            fetchCollection("rombel"),
          ]);

        if (!active) return;
        setViolations(violData);
        setAttendance(attData);
        setPermanentAbsences(permData);
        setCounseling(counsData);
        setRombel(rombelData);
      } catch (err) {
        if (!active) return;
        setErrorMsg(
          "Belum dapat memuat data Firestore. Pastikan Firestore sudah aktif dan sinkronisasi berjalan."
        );
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadFirestoreData();
    return () => {
      active = false;
    };
  }, []);

  const allClasses = useMemo(() => {
    const combined = Array.from(new Set([...KELAS_PUTRA, ...KELAS_PUTRI]));
    rombel.forEach((r) => {
      const k = pickValue(r, ["KELAS", "Kelas", "kelas", "Rombel"]);
      if (k && !combined.includes(k)) combined.push(k);
    });
    return combined;
  }, [rombel]);

  const studentSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        nama: string;
        nis: string;
        kelas: string;
        bebanPoin: number;
        sisaPoin: number;
        jumlahPelanggaran: number;
      }
    >();

    rombel.forEach((r) => {
      const nama = pickValue(r, ["Nama", "nama", "Nama Siswa", "siswa"]);
      const kelas = pickValue(r, ["KELAS", "Kelas", "kelas"]);
      const nis = pickValue(r, ["NIS", "nis", "NO", "No"]);
      if (!nama) return;
      const key = `${nama.toLowerCase()}__${kelas.toLowerCase()}`;
      map.set(key, {
        nama,
        nis,
        kelas,
        bebanPoin: 0,
        sisaPoin: 100,
        jumlahPelanggaran: 0,
      });
    });

    violations.forEach((v) => {
      const nama = pickValue(v, ["siswa", "Nama Siswa", "Nama", "nama"]);
      const kelas = pickValue(v, ["Kelas", "kelas", "KELAS"]);
      const beban =
        pickNumber(v, ["BEBAN POIN", "Beban Poin", "beban_poin", "Poin"]) ?? 0;
      if (!nama) return;

      const key = `${nama.toLowerCase()}__${kelas.toLowerCase()}`;
      const existing = map.get(key) || {
        nama,
        nis: "-",
        kelas,
        bebanPoin: 0,
        sisaPoin: 100,
        jumlahPelanggaran: 0,
      };

      existing.bebanPoin += beban;
      existing.sisaPoin = Math.max(0, 100 - existing.bebanPoin);
      existing.jumlahPelanggaran += 1;
      if (!existing.kelas && kelas) existing.kelas = kelas;
      map.set(key, existing);
    });

    return Array.from(map.values())
      .filter((item) => {
        const matchClass =
          !selectedClass ||
          item.kelas.toLowerCase() === selectedClass.toLowerCase();
        const matchSearch =
          !searchQuery.trim() ||
          item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.kelas.toLowerCase().includes(searchQuery.toLowerCase());
        return matchClass && matchSearch;
      })
      .sort((a, b) => a.sisaPoin - b.sisaPoin);
  }, [rombel, violations, selectedClass, searchQuery]);

  const filteredViolations = useMemo(() => {
    return violations.filter((v) => {
      const nama = pickValue(v, ["siswa", "Nama Siswa", "Nama"]);
      const kelas = pickValue(v, ["Kelas", "kelas", "KELAS"]);
      const okClass =
        !selectedClass || kelas.toLowerCase() === selectedClass.toLowerCase();
      const okSearch =
        !searchQuery.trim() ||
        nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kelas.toLowerCase().includes(searchQuery.toLowerCase());
      return okClass && okSearch;
    });
  }, [violations, selectedClass, searchQuery]);

  const handleUnlockCounseling = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === PIN_KONSELING) {
      setCounselingUnlocked(true);
      setPinError("");
    } else {
      setPinError("PIN konseling tidak sesuai.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-emerald-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-emerald-200">
              SMA Progresif Bumi Shalawat
            </p>
            <h1 className="text-xl font-bold">
              Sistem Kedisiplinan & Presensi Siswa
              {selectedClass ? ` — Kelas ${selectedClass}` : ""}
            </h1>
          </div>
          <div className="text-xs text-emerald-100 space-y-0.5 md:text-right">
            <div>Kepala Sekolah: {KEPALA_SEKOLAH}</div>
            <div>Waka Kesiswaan: {WAKA_KESISWAAN}</div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {errorMsg && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
            {errorMsg}
          </div>
        )}

        {!kelasParam && (
          <nav className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            {[
              { id: "dashboard", label: "Rekap Poin (Awal 100)" },
              { id: "violations", label: "Riwayat Pelanggaran" },
              { id: "attendance", label: "Presensi & Alpa" },
              { id: "counseling", label: "Konseling (PIN)" },
              { id: "reports", label: "Format Laporan" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setActiveTab(
                    tab.id as
                      | "dashboard"
                      | "violations"
                      | "attendance"
                      | "counseling"
                      | "reports"
                  )
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-emerald-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Kelas:</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              disabled={Boolean(kelasParam)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Semua Kelas</option>
              {allClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama siswa atau kelas..."
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-72"
          />
        </section>

        {loading ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
            Memuat data kedisiplinan...
          </div>
        ) : (
          <>
            {(activeTab === "dashboard" || Boolean(kelasParam)) && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">
                    Rekap Poin Siswa (Saldo Awal 100 − Beban Poin)
                  </h2>
                  <span className="text-xs text-slate-500">
                    {studentSummaries.length} siswa
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="py-2.5 px-4">No</th>
                        <th className="py-2.5 px-4">Nama Siswa</th>
                        <th className="py-2.5 px-4">Kelas</th>
                        <th className="py-2.5 px-4">Pelanggaran</th>
                        <th className="py-2.5 px-4">Beban Poin</th>
                        <th className="py-2.5 px-4">Sisa Poin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentSummaries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-6 px-4 text-center text-slate-500"
                          >
                            Belum ada data siswa atau pelanggaran yang cocok.
                          </td>
                        </tr>
                      ) : (
                        studentSummaries.map((st, index) => (
                          <tr
                            key={`${st.nama}-${st.kelas}-${index}`}
                            className="hover:bg-slate-50"
                          >
                            <td className="py-2.5 px-4">{index + 1}</td>
                            <td className="py-2.5 px-4 font-medium">
                              {st.nama}
                            </td>
                            <td className="py-2.5 px-4">{st.kelas || "-"}</td>
                            <td className="py-2.5 px-4">
                              {st.jumlahPelanggaran}
                            </td>
                            <td className="py-2.5 px-4 text-rose-700 font-medium">
                              -{st.bebanPoin}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-emerald-800">
                              {st.sisaPoin}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!kelasParam && activeTab === "violations" && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-800">
                    Riwayat Pelanggaran (MASTER)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="py-2.5 px-4">Tanggal</th>
                        <th className="py-2.5 px-4">Siswa</th>
                        <th className="py-2.5 px-4">Kelas</th>
                        <th className="py-2.5 px-4">Pelanggaran</th>
                        <th className="py-2.5 px-4">Beban</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredViolations.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 px-4 text-center text-slate-500"
                          >
                            Tidak ada data pelanggaran.
                          </td>
                        </tr>
                      ) : (
                        filteredViolations.map((v, idx) => (
                          <tr key={String(v.id || idx)} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {pickValue(v, [
                                "Tanggal",
                                "waktu pelanggaran",
                                "Timestamp",
                              ]) || "-"}
                            </td>
                            <td className="py-2.5 px-4 font-medium">
                              {pickValue(v, ["siswa", "Nama Siswa", "Nama"]) ||
                                "-"}
                            </td>
                            <td className="py-2.5 px-4">
                              {pickValue(v, ["Kelas", "kelas", "KELAS"]) ||
                                "-"}
                            </td>
                            <td className="py-2.5 px-4">
                              {pickValue(v, ["pelanggaran", "Pelanggaran"]) ||
                                "-"}
                            </td>
                            <td className="py-2.5 px-4 text-rose-700 font-semibold">
                              -
                              {pickNumber(v, [
                                "BEBAN POIN",
                                "Beban Poin",
                                "beban_poin",
                              ]) ?? 0}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!kelasParam && activeTab === "attendance" && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <h2 className="font-semibold text-slate-800">
                  Rekap Presensi & Alpa Permanen
                </h2>
                <p className="text-xs text-slate-500">
                  Data presensi tersaring: {attendance.length} baris · Rekap
                  alpa permanen: {permanentAbsences.length} baris.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Nama Siswa</th>
                        <th className="py-2 px-3">Kelas</th>
                        <th className="py-2 px-3">Alpa / Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {permanentAbsences.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-4 px-3 text-center text-slate-500"
                          >
                            Belum ada data rekap alpa permanen.
                          </td>
                        </tr>
                      ) : (
                        permanentAbsences.map((item, idx) => (
                          <tr key={String(item.id || idx)}>
                            <td className="py-2 px-3 font-medium">
                              {pickValue(item, [
                                "Nama Siswa",
                                "Nama",
                                "siswa",
                              ]) || "-"}
                            </td>
                            <td className="py-2 px-3">
                              {pickValue(item, ["Kelas", "KELAS", "kelas"]) ||
                                "-"}
                            </td>
                            <td className="py-2 px-3">
                              {pickValue(item, [
                                "Tanpa Keterangan / Alpa",
                                "Alpa",
                                "Keterangan",
                              ]) || "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!kelasParam && activeTab === "counseling" && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-slate-800">
                  Data Konseling Siswa
                </h2>
                {!counselingUnlocked ? (
                  <form
                    onSubmit={handleUnlockCounseling}
                    className="max-w-sm space-y-3"
                  >
                    <p className="text-sm text-slate-600">
                      Masukkan PIN akses konseling untuk membuka data.
                    </p>
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Masukkan PIN"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    />
                    {pinError && (
                      <p className="text-xs text-rose-600">{pinError}</p>
                    )}
                    <button
                      type="submit"
                      className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Buka Data Konseling
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-700">
                    Akses terbuka. Total catatan konseling: {counseling.length}.
                  </p>
                )}
              </section>
            )}

            {!kelasParam && activeTab === "reports" && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-slate-800">
                  Acuan Pembinaan & Panggilan Kesiswaan
                </h2>
                <div className="text-sm space-y-2 text-slate-700">
                  <p>
                    <strong>Pembinaan:</strong> {HUKUMAN_PEMBINAAN}
                  </p>
                  <p>
                    <strong>Panggilan:</strong> {HUKUMAN_PEMANGGILAN}
                  </p>
                  <p>
                    <strong>Link Kelas Publik:</strong> Tambahkan{" "}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                      ?kelas=XII%20E1
                    </code>{" "}
                    di akhir URL website untuk tampilan khusus per kelas.
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Menyiapkan halaman...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
