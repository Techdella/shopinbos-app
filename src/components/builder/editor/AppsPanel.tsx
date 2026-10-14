"use client";

import { Toggle } from "@/components/app-ui";
import type { TemplateSectionNode } from "@/lib/store-templates";
import { appEnabled, EDITOR_APPS, type EditorApp, type RendererKind } from "./editor-logic";
import { PanelHeading } from "./ui";
import { useEditorT } from "./i18n";

export interface AppsPanelProps {
  renderer: RendererKind;
  homeSections: TemplateSectionNode[] | null;
  onToggle: (app: EditorApp, on: boolean) => void;
  onClose: () => void;
}

export function AppsPanel(props: AppsPanelProps) {
  const { tx } = useEditorT();
  const available = props.renderer === "boutique" && props.homeSections;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading title="Apps" onClose={props.onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {available ? (
          <>
            <ul className="m-0 list-none p-0">
              {EDITOR_APPS.map((app) => {
                const on = appEnabled(props.homeSections!, app);
                return (
                  <li key={app.id} className="flex items-center gap-3 border-b border-app-line py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-app-ink">{tx(app.label)}</p>
                      <p className="text-[12.5px] leading-5 text-app-ink-soft">{tx(app.description)}</p>
                    </div>
                    <Toggle on={on} onChange={(next) => props.onToggle(app, next)} label={tx(app.label)} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] leading-5 text-app-ink-soft">{tx("Apps add a section to your home page. Move it, edit it or hide it like any other section.")}</p>
          </>
        ) : (
          <p className="mt-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">
            {props.homeSections
              ? tx("Apps work with the newer themes. Pick one in Themes to use reviews and the countdown timer.")
              : tx("Apps add sections to your home page. This store doesn't have a home page yet.")}
          </p>
        )}
      </div>
    </div>
  );
}
