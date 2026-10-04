export type AiSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";

export interface CallQualityScores {
  /** 1-5 each: conversion likelihood, agent politeness/rapport, discovery questions, prospect engagement, prospect sentiment. */
  conversion: number;
  politeness: number;
  questioning: number;
  engagement: number;
  sentiment: number;
}

export interface CallAnalysis {
  summary: string;
  sentiment: AiSentiment;
  /** 0-100: how well the call went for the prospect. */
  score: number;
  scores: CallQualityScores;
  keyPoints: string[];
  /** 0-1: model self-reported confidence. */
  confidence: number;
  model: string;
}
