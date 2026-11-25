import { describe, expect, it } from "vitest";
import { parseEntries } from "./parser";

describe("parseEntries required phrases", () => {
  it.each([
    ["Ramesh ne 200 ka saman udhaar liya", "Ramesh", 200, "gave_credit", "saman"],
    ["Sunita ne 500 wapas diye", "Sunita", 500, "received_payment", undefined],
    ["Mohan ko do sau rupay udhaar", "Mohan", 200, "gave_credit", undefined],
    ["Geeta didi ne paanch sau jama kiye", "Geeta", 500, "received_payment", undefined],
    ["रमेश ने 150 उधार लिया", "रमेश", 150, "gave_credit", undefined],
    ["Raju 1200 le gaya", "Raju", 1200, "gave_credit", undefined],
    ["Amit ne ₹75 chai ka udhaar liya", "Amit", 75, "gave_credit", "chai"],
    ["Sita ne 2 hazaar wapas kiye", "Sita", 2000, "received_payment", undefined],
    ["Anil ne dedh hazaar jama kiye", "Anil", 1500, "received_payment", undefined],
    ["Ramesh ne ek hazar paanch sau udhaar liya", "Ramesh", 1500, "gave_credit", undefined],
    ["Sunita ne pandra sau wapas diye", "Sunita", 1500, "received_payment", undefined],
    ["Mohan ne पंद्रह सौ जमा किए", "Mohan", 1500, "received_payment", undefined],
    ["Geeta ko do hazar paanch sau udhaar", "Geeta", 2500, "gave_credit", undefined],
  ] as const)(
    "%s",
    (phrase, name, amount, type, note) => {
      expect(parseEntries(phrase)).toMatchObject([
        { name, amount, type, ...(note ? { note } : {}) },
      ]);
    },
  );

  it("splits two entries in one utterance", () => {
    expect(
      parseEntries("Ramesh ko 200 udhaar aur Sunita ne 500 diye"),
    ).toMatchObject([
      { name: "Ramesh", amount: 200, type: "gave_credit" },
      { name: "Sunita", amount: 500, type: "received_payment" },
    ]);
  });

  it("keeps an unclear type null with low confidence", () => {
    const [entry] = parseEntries("dhai sau Ramesh");
    expect(entry).toMatchObject({
      name: "Ramesh",
      amount: 250,
      type: null,
    });
    expect(entry.confidence).toBeLessThan(0.5);
  });

  it("returns no entries when no transaction amount is present", () => {
    expect(parseEntries("kuch nahi")).toEqual([]);
  });
});

describe("number words and Hindi text", () => {
  it.each([
    ["ek sau", 100],
    ["do sau", 200],
    ["teen sau", 300],
    ["char sau", 400],
    ["paanch sau", 500],
    ["das", 10],
    ["bees", 20],
    ["pachas", 50],
    ["dhai sau", 250],
    ["दो सौ", 200],
    ["तीन सौ", 300],
    ["पाँच सौ", 500],
    ["ढाई सौ", 250],
    ["डेढ़ सौ", 150],
    ["दो हजार", 2000],
    ["ढाई हजार", 2500],
    ["ek hazar paanch sau", 1500],
    ["pandra sau", 1500],
    ["do hazar paanch sau", 2500],
    ["पंद्रह सौ", 1500],
  ])("parses %s as %i rupees", (amountPhrase, amount) => {
    expect(parseEntries(`${amountPhrase} Ramesh`)).toMatchObject([
      { name: "Ramesh", amount },
    ]);
  });

  it("reads Devanagari digits in rupee amounts", () => {
    expect(parseEntries("सीमा ने १५० उधार लिया")).toMatchObject([
      { name: "सीमा", amount: 150, type: "gave_credit" },
    ]);
  });

  it("strips honorifics from names", () => {
    expect(parseEntries("Geeta ji ne 100 wapas diye")).toMatchObject([
      { name: "Geeta", amount: 100 },
    ]);
  });

  it.each([
    ["aur", "Ramesh ne 100 udhaar liya aur Sita ne 25 diye"],
    ["phir", "Ramesh ne 100 udhaar liya phir Sita ne 25 diye"],
    ["and", "Ramesh ne 100 udhaar liya and Sita ne 25 diye"],
    ["comma", "Ramesh ne 100 udhaar liya, Sita ne 25 diye"],
    ["danda", "Ramesh ne 100 udhaar liya। Sita ne 25 diye"],
  ])("splits on %s", (_separator, phrase) => {
    expect(parseEntries(phrase)).toHaveLength(2);
  });

  it("supports credit given with ko and diya", () => {
    expect(parseEntries("Mohan ko 50 rupay diya")).toMatchObject([
      { name: "Mohan", type: "gave_credit" },
    ]);
  });

  it("supports received payments in Devanagari", () => {
    expect(parseEntries("सीमा ने ५०० वापस दिए")).toMatchObject([
      { name: "सीमा", amount: 500, type: "received_payment" },
    ]);
  });
});
