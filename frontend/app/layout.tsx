import "./globals.css";

export const metadata = { title: "Agent Moneyball", description: "Ask the pitch data." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
