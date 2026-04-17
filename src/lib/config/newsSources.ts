export type NewsFeedConfig = {
  url: string;
  source: string;
};

export const NEWS_FEEDS: NewsFeedConfig[] = [
  {
    url: "https://polisen.se/aktuellt/rss/stockholms-lan/nyheter-rss---stockholms-lan/",
    source: "Polisen Nyheter Stockholm",
  },
  { url: "https://www.stockholmsfria.se//feed", source: "Stockholms Fria" },
  { url: "https://www.svt.se/nyheter/lokalt/stockholm/rss.xml", source: "SVT Stockholm" },
  { url: "https://www.dn.se/rss/sthlm/", source: "Dagens Nyheter Stockholm" },
  { url: "https://www.mitti.se/rss-6.8.0.0.e70d15cb3c", source: "Mitt i" },
  { url: "https://feeds.expressen.se/nyheter/stockholm/", source: "Expressen Stockholm" },
];

export function getNewsSources(): NewsFeedConfig[] {
  return NEWS_FEEDS;
}
