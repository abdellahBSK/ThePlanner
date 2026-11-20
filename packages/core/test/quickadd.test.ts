import { describe, expect, it } from "vitest";
import { nowIn, parseDate, parseQuickAdd } from "../src";

const TODAY = "2026-11-20"; // a Friday
const blank = { title: "", estimate: null, due: null, priority: null, project: null };

describe("parseQuickAdd edge cases", () => {
  it("handles empty and whitespace-only input", () => {
    expect(parseQuickAdd("", TODAY)).toEqual(blank);
    expect(parseQuickAdd("   \t  ", TODAY)).toEqual(blank);
  });

  it("handles input made only of tokens", () => {
    expect(parseQuickAdd("2h #Cyber !high due tomorrow", TODAY)).toEqual({
      title: "", estimate: 2, due: "2026-11-21", priority: 3, project: "Cyber",
    });
  });

  it("uses only the first of duplicate tokens and leaves the rest in the title", () => {
    const r = parseQuickAdd("Task 2h 3h #a #b !high !low", TODAY);
    expect(r).toMatchObject({ estimate: 2, project: "a", priority: 3 });
    expect(r.title).toBe("Task 3h #b !low");
  });

  it("uses the first due phrase only", () => {
    const r = parseQuickAdd("Task due mon by fri", TODAY);
    expect(r.due).toBe("2026-11-23");
    expect(r.title).toBe("Task by fri");
  });

  it("leaves impossible calendar dates in the title with no deadline", () => {
    expect(parseQuickAdd("Task due feb 30", TODAY)).toMatchObject({ due: null, title: "Task due feb 30" });
    expect(parseQuickAdd("Task due 2026-13-01", TODAY)).toMatchObject({ due: null, title: "Task due 2026-13-01" });
  });

  it("keeps unknown tokens and unparseable due phrases in the title", () => {
    expect(parseQuickAdd("Task due someday", TODAY)).toMatchObject({ due: null, title: "Task due someday" });
    expect(parseQuickAdd("Task !urgent @home 5x", TODAY)).toMatchObject({ priority: null, estimate: null, title: "Task !urgent @home 5x" });
  });

  it("parses estimates in several spellings", () => {
    expect(parseQuickAdd("a 90m", TODAY).estimate).toBe(1.5);
    expect(parseQuickAdd("a 1.5h", TODAY).estimate).toBe(1.5);
    expect(parseQuickAdd("a 1,5 hours", TODAY).estimate).toBe(1.5);
    expect(parseQuickAdd("a 20 min", TODAY).estimate).toBe(0.33);
    expect(parseQuickAdd("a 0h", TODAY).estimate).toBe(0);
  });

  it("does not read an estimate glued to a word or inside a word", () => {
    expect(parseQuickAdd("Read chapter 2hello", TODAY)).toMatchObject({ estimate: null, title: "Read chapter 2hello" });
  });

  it("parses priorities case-insensitively", () => {
    expect(parseQuickAdd("a !LOW", TODAY).priority).toBe(1);
    expect(parseQuickAdd("a !l", TODAY).priority).toBe(1);
    expect(parseQuickAdd("a !normal", TODAY).priority).toBe(2);
    expect(parseQuickAdd("a !!", TODAY).priority).toBe(3);
    expect(parseQuickAdd("a !H", TODAY).priority).toBe(3);
  });

  it("supports unicode titles and project names", () => {
    const r = parseQuickAdd("Écrire le rapport 日本語 🚀 #Sécurité-Réseau 2h", TODAY);
    expect(r.title).toBe("Écrire le rapport 日本語 🚀");
    expect(r.project).toBe("Sécurité Réseau");
    expect(r.estimate).toBe(2);
    expect(parseQuickAdd("Задача #проект", TODAY)).toMatchObject({ title: "Задача", project: "проект" });
  });

  it("handles very long titles", () => {
    const long = "word ".repeat(5000).trim();
    const r = parseQuickAdd(`${long} 2h due tomorrow`, TODAY);
    expect(r.title).toBe(long);
    expect(r.estimate).toBe(2);
    expect(r.due).toBe("2026-11-21");
  });

  it("collapses internal whitespace and tabs", () => {
    expect(parseQuickAdd("  Buy \t  milk   2h  ", TODAY)).toMatchObject({ title: "Buy milk", estimate: 2 });
  });

  it("accepts 'by' and 'on' as due keywords", () => {
    expect(parseQuickAdd("Pay rent by 1/12", TODAY).due).toBe("2026-12-01");
    expect(parseQuickAdd("Dentist on mon", TODAY)).toMatchObject({ due: "2026-11-23", title: "Dentist" });
  });
});

describe("parseDate boundaries", () => {
  it("rolls past dates into next year across the year boundary", () => {
    expect(parseDate("jan 5", "2026-12-31")?.date).toBe("2027-01-05");
    expect(parseDate("dec 31", "2026-12-31")?.date).toBe("2026-12-31");
    expect(parseDate("dec 30", "2026-12-31")?.date).toBe("2027-12-30");
    expect(parseDate("5/1", "2026-12-31")?.date).toBe("2027-01-05");
    expect(parseDate("1 jan", "2026-01-01")?.date).toBe("2026-01-01");
  });

  it("adds days across month and year ends and leap days", () => {
    expect(parseDate("tomorrow", "2026-12-31")?.date).toBe("2027-01-01");
    expect(parseDate("tomorrow", "2028-02-28")?.date).toBe("2028-02-29");
    expect(parseDate("tomorrow", "2026-02-28")?.date).toBe("2026-03-01");
    expect(parseDate("in 2 weeks", "2026-12-25")?.date).toBe("2027-01-08");
    expect(parseDate("in 1d", TODAY)?.date).toBe("2026-11-21");
  });

  it("resolves weekdays relative to today", () => {
    expect(parseDate("fri", TODAY)?.date).toBe("2026-11-27");
    expect(parseDate("next fri", TODAY)?.date).toBe("2026-12-04");
    expect(parseDate("sat", TODAY)?.date).toBe("2026-11-21");
    expect(parseDate("mon", "2026-12-30")?.date).toBe("2027-01-04");
  });

  it("returns null for nonsense", () => {
    expect(parseDate("", TODAY)).toBeNull();
    expect(parseDate("someday", TODAY)).toBeNull();
    expect(parseDate("13/40", TODAY)).toBeNull();
    expect(parseDate("0/5", TODAY)).toBeNull();
    expect(parseDate("foo 5", TODAY)).toBeNull();
  });

  it("does not produce impossible calendar dates", () => {
    expect(parseDate("feb 30", TODAY)).toBeNull();
    expect(parseDate("31/4", TODAY)).toBeNull();
    expect(parseDate("2026-02-31", TODAY)).toBeNull();
    expect(parseDate("2026-13-01", TODAY)).toBeNull();
  });

  it("rolls Feb 29 to the next leap year", () => {
    expect(parseDate("feb 29", "2026-11-20")?.date).toBe("2028-02-29");
    expect(parseDate("feb 29", "2027-03-01")?.date).toBe("2028-02-29");
    expect(parseDate("feb 29", "2028-01-10")?.date).toBe("2028-02-29");
  });

  it("keeps Feb 29 on the leap day itself and checks ISO leap days", () => {
    expect(parseDate("feb 29", "2028-02-29")?.date).toBe("2028-02-29");
    expect(parseDate("2028-02-29", TODAY)?.date).toBe("2028-02-29");
    expect(parseDate("2026-02-29", TODAY)).toBeNull();
  });
});

describe("nowIn across DST", () => {
  it("reads local date and minute around New York spring forward", () => {
    // 2026-03-08 02:00 EST jumps to 03:00 EDT (07:00Z)
    expect(nowIn("America/New_York", new Date("2026-03-08T06:59:00Z"))).toEqual({ date: "2026-03-08", minutes: 1 * 60 + 59 });
    expect(nowIn("America/New_York", new Date("2026-03-08T07:00:00Z"))).toEqual({ date: "2026-03-08", minutes: 3 * 60 });
  });

  it("reads local date and minute around New York fall back", () => {
    // 2026-11-01 02:00 EDT falls back to 01:00 EST (06:00Z)
    expect(nowIn("America/New_York", new Date("2026-11-01T05:30:00Z"))).toEqual({ date: "2026-11-01", minutes: 60 + 30 });
    expect(nowIn("America/New_York", new Date("2026-11-01T06:30:00Z"))).toEqual({ date: "2026-11-01", minutes: 60 + 30 });
    expect(nowIn("America/New_York", new Date("2026-11-01T04:00:00Z"))).toEqual({ date: "2026-11-01", minutes: 0 });
  });

  it("reads local date and minute around Paris spring forward", () => {
    // 2026-03-29 02:00 CET jumps to 03:00 CEST (01:00Z)
    expect(nowIn("Europe/Paris", new Date("2026-03-29T00:59:00Z"))).toEqual({ date: "2026-03-29", minutes: 60 + 59 });
    expect(nowIn("Europe/Paris", new Date("2026-03-29T01:00:00Z"))).toEqual({ date: "2026-03-29", minutes: 180 });
    expect(nowIn("Europe/Paris", new Date("2026-03-28T23:00:00Z"))).toEqual({ date: "2026-03-29", minutes: 0 });
  });
});
