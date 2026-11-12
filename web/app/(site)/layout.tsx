import Link from "next/link";
import CompareBar from "@/components/CompareBar";
import Header, { TabBar } from "@/components/Header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">پرش به محتوا</a>
      <Header />
      <main id="main" className="wrap" tabIndex={-1}>{children}</main>
      <footer className="site-foot">
        <div className="wrap">
          <div className="cols">
            <div>
              <h4>پت‌مچ</h4>
              <p>پت‌مچ فروشنده نیست؛ قیمت فروشگاه‌ها را مقایسه می‌کند و شما را به فروشگاه منتخب هدایت می‌کند. رتبه‌بندی ارگانیک است و قابل خرید نیست.</p>
            </div>
            <div>
              <h4>دسته‌ها</h4>
              <Link href="/search?q=غذای خشک گربه">غذای خشک گربه</Link>
              <Link href="/search?q=غذای خشک سگ">غذای خشک سگ</Link>
              <Link href="/search?q=خاک گربه">خاک گربه</Link>
              <Link href="/search?q=تشویقی گربه">تشویقی</Link>
            </div>
            <div>
              <h4>حساب کاربری</h4>
              <Link href="/login">ورود با کد یک‌بارمصرف</Link>
              <Link href="/signup">ثبت‌نام خریدار یا فروشنده</Link>
              <Link href="/seller">پنل فروشنده</Link>
              <Link href="/admin">پنل مدیریت</Link>
            </div>
          </div>
          <div className="fine">نسخه نمایشی: فروشگاه‌ها، قیمت‌ها، آمار و لینک‌ها ساختگی‌اند. تصاویر محصولات نمادین هستند. پیشنهادها جایگزین نظر دامپزشک نیستند.</div>
        </div>
      </footer>
      <CompareBar />
      <TabBar />
    </>
  );
}
