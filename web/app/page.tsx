import LandingDrop from "@/components/LandingDrop";
import SiteHeader from "@/components/SiteHeader";
import ToolCards from "@/components/ToolCards";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="box-border w-full max-w-[1280px] px-[clamp(20px,4vw,40px)] pt-[clamp(32px,5vw,64px)] pb-[72px]">
        <h1 className="mb-4 max-w-[16ch] text-[clamp(34px,5vw,56px)] [text-wrap:pretty]">
          Four things to an image. Nothing else.
        </h1>
        <p className="mb-[clamp(28px,4vw,44px)] max-w-[54ch] text-[17px] leading-normal">
          Cut the background out, fit a frame, drop the file weight, sign a corner. Nothing is kept once you&rsquo;ve
          downloaded the result.
        </p>
        <div className="mb-[clamp(28px,4vw,44px)]">
          <ToolCards />
        </div>
        <LandingDrop />
      </main>
    </div>
  );
}
