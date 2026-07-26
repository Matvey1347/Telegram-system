"use client";

import { useLayoutEffect, useRef } from "react";
import { useTabIdentityController } from "@/providers/tab-identity-provider";
import type { TabIdentityOverride } from "@/lib/tab-identity";

export function PageTabHead({
  title,
  iconUrl,
  emoji,
  color,
}: TabIdentityOverride) {
  const controller = useTabIdentityController();
  const idRef = useRef("");

  useLayoutEffect(() => {
    if (!controller) return;
    if (!idRef.current) {
      idRef.current = `page-tab-head:${Math.random().toString(36).slice(2)}`;
    }
    controller.setOverride(idRef.current, {
      title,
      iconUrl,
      emoji,
      color,
    });
    return () => {
      controller.clearOverride(idRef.current);
    };
  }, [color, controller, emoji, iconUrl, title]);

  return null;
}
