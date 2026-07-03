import type { Metadata } from "next";
import AnalyticsClient from "./AnalyticsClient";

export const metadata: Metadata = { title: "분석" };

export default function AdminAnalyticsPage() {
  return <AnalyticsClient />;
}
