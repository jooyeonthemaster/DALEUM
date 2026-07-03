import type { Metadata } from "next";
import ContentClient from "./ContentClient";

export const metadata: Metadata = { title: "콘텐츠" };

export default function AdminContentPage() {
  return <ContentClient />;
}
