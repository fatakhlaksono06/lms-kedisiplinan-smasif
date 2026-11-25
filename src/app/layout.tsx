import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin Kedisiplinan SMA Progresif Bumi Shalawat",
  description: "Sistem Informasi Kedisiplinan & Presensi Siswa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
