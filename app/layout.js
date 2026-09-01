import "./globals.css";

export const metadata = {
  title: "مدارك | منصة التعلّم",
  description: "منصة تعليمية حديثة لتطوير مهاراتك.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
