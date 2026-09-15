/**
 * DATA RESPONSE IN ADD LIVE TAG - EXAMPLE
 * {
    "success": true,
    "url": "https:\/\/s.shopee.vn\/7ptFtrEO1m",
    "affiliateLink": "https:\/\/s.shopee.vn\/BTolxqCRa",
    "altLink": "https:\/\/s.shopee.vn\/an_redir?origin_link=https%3A%2F%2Fshopee.vn%2Fproduct%2F1675140528%2F51011334892&affiliate_id=17303170528&sub_id=abc-xyz-aaa-bbb-zzz",
    "altLabel": "Link gốc an_redir (dùng khi dán ngoài app)",
    "affiliate_id": "17303170528",
    "platform": "shopee",
    "via_slug": true,
    "subids": {
        "sub1": "abc",
        "sub2": "xyz",
        "sub3": "aaa",
        "sub4": "bbb",
        "sub5": "zzz"
        }
    }
 * 
 */
interface GenerateLinkAddLiveTag {
  success: boolean;
  url: string;
  affiliateLink: string;
  altLink: string;
  altLabel: string;
  affiliate_id: string;
  platform: string;
  via_slug: boolean;
  subids: SubIds;
}

interface SubIds {
  sub1: string;
  sub2: string;
  sub3: string;
  sub4: string;
  sub5: string;
}

export { GenerateLinkAddLiveTag, SubIds };
