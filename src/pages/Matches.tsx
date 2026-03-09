import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Info, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MatchResult } from "../types";

export default function Matches() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    const res = await fetch("/api/matches", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    const data = await res.json();
    setMatches(data);
    setLoading(false);
  };

  const handleStatusUpdate = async (id: number, status: 'APPROVED' | 'REJECTED') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/matches/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}` 
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchMatches();
        setSelectedMatch(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Match Results</h1>
        <p className="text-slate-500 mt-1">Review and verify potential matches identified by the AI engine.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {matches.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-200 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No matches found yet</h3>
            <p className="text-slate-500">Matches will appear here once the AI identifies potential similarities.</p>
          </div>
        ) : (
          matches.map((match) => (
            <motion.div
              key={match.id}
              layout
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-center gap-8"
            >
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-slate-100 mb-2">
                    <img src={match.missing_photo} alt="Missing" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Missing Report</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    match.confidence_score > 80 ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                  )}>
                    {match.confidence_score.toFixed(1)}% Match
                  </div>
                  <div className="h-px w-8 bg-slate-200" />
                </div>
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-slate-100 mb-2">
                    <img src={match.found_photo} alt="Found" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Found Child</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Potential Match: {match.missing_name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">{match.ai_analysis}</p>
                <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    Found at: {match.found_location}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    Identified: {new Date(match.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full md:w-auto">
                <div className={cn(
                  "px-4 py-2 rounded-xl text-center text-xs font-bold uppercase tracking-widest mb-2",
                  match.status === 'PENDING' ? "bg-amber-50 text-amber-600" :
                  match.status === 'APPROVED' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {match.status}
                </div>
                <button
                  onClick={() => setSelectedMatch(match)}
                  className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  Review Details
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {selectedMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden relative"
            >
              <button
                onClick={() => setSelectedMatch(null)}
                className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors z-10"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>

              <div className="p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Match Verification</h2>
                    <p className="text-slate-500 text-sm">Review AI analysis and confirm identification.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Missing Record</label>
                        <div className="aspect-square rounded-3xl overflow-hidden border border-slate-200">
                          <img src={selectedMatch.missing_photo} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-center font-bold text-slate-900 mt-2">{selectedMatch.missing_name}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Found Record</label>
                        <div className="aspect-square rounded-3xl overflow-hidden border border-slate-200">
                          <img src={selectedMatch.found_photo} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-center font-bold text-slate-900 mt-2">Found Child</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">AI Analysis Report</h4>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="text-4xl font-bold text-emerald-600">{selectedMatch.confidence_score.toFixed(1)}%</div>
                        <div className="text-xs font-medium text-slate-500 leading-tight">
                          Confidence score calculated based on facial geometry and key feature alignment.
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed italic">
                        "{selectedMatch.ai_analysis}"
                      </p>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700">
                        <strong>Officer Note:</strong> Please verify physical descriptions and contact the reporter before final approval.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleStatusUpdate(selectedMatch.id, 'REJECTED')}
                    className="flex-1 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    Reject Match
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleStatusUpdate(selectedMatch.id, 'APPROVED')}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Approve Identification
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { MapPin, Clock, Search } from "lucide-react";

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
