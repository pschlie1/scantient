import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page">
      <MarketingNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
