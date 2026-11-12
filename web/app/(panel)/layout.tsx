import PanelHeader from "@/components/PanelHeader";

/** Seller and admin panels are work tools, not the shop: no product search, category menus,
 * "my pet", favorites or footer. Just the panel's own navigation and a way back to the site. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel-shell">
      <a className="skip" href="#main">پرش به محتوا</a>
      <PanelHeader />
      <main id="main" className="wrap" tabIndex={-1}>{children}</main>
    </div>
  );
}
