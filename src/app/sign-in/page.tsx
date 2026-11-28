import type { Metadata } from "next";
import { Suspense } from "react";
import SignInView from "@/components/SignInView";

export const metadata: Metadata = { title: "Sign in – Stock Analysis", description: "Sign in with Google to build sectors and watch stocks. Browsing needs no account." };

// The page is the same for everyone and built once; what it says depends on the address (?error=…&returnTo=…), read in the browser.
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInView />
    </Suspense>
  );
}
