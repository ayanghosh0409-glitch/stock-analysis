import data from "../../data/stocks.json";
import newsData from "../../data/news.json";
import Dashboard from "@/components/Dashboard";
import { cleanNews } from "@/lib/news";
import type { Dataset } from "@/lib/types";

export default function Home() {
  return <Dashboard data={data as Dataset} news={cleanNews(newsData)} />;
}
