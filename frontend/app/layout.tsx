import "./globals.css";

export const metadata = { title: "PitchQuery", description: "Ask the pitch data." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

