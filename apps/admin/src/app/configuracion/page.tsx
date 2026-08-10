"use client";

import { useState } from "react";
import { FileText, Mail, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentPanel } from "./content-panel";
import { SmtpPanel } from "./smtp-panel";
import { ServiceFeePanel } from "./service-fee-panel";

type SettingsTab = "content" | "smtp" | "service-fee";

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<SettingsTab>("content");

  return (
    <div className="space-y-4">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <h1 className="page-title">Configuración</h1>
            <p className="page-description">
              Contenido del sitio de clientes, correo SMTP y tarifa de
              servicios.
            </p>
          </div>
        </div>
        <div className="admin-panel-toolbar">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "content" && "admin-tab-pill-active",
              )}
              onClick={() => setTab("content")}
            >
              <FileText className="h-4 w-4" />
              Contenido
            </button>
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "smtp" && "admin-tab-pill-active",
              )}
              onClick={() => setTab("smtp")}
            >
              <Mail className="h-4 w-4" />
              Correo SMTP
            </button>
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "service-fee" && "admin-tab-pill-active",
              )}
              onClick={() => setTab("service-fee")}
            >
              <Percent className="h-4 w-4" />
              Tarifa de servicios
            </button>
          </div>
        </div>
      </div>

      {tab === "content" ? (
        <ContentPanel />
      ) : tab === "smtp" ? (
        <SmtpPanel />
      ) : (
        <ServiceFeePanel />
      )}
    </div>
  );
}
