@@ .. @@
             <SummaryDisplay 
               summaryChunks={[item.summary_text]}
               flashcards={item.flashcards_json}
               originalText={item.original_text_content || ''}
               topics={item.topics || []}
+              medicalMode={item.title.toLowerCase().includes('medical') ||
+                item.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)))}
               onPublishToLibrary={() => Promise.resolve(false)} // Disabled for shared view
               onReset={() => {}} // Disabled for shared view
               isSharedView={true}
             />
             
             {item.flashcards_json.length > 0 && (
               <FlashcardViewer 
                 flashcards={item.flashcards_json}
+                medicalMode={item.title.toLowerCase().includes('medical') ||
+                  item.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)))}
               />
             )}
           </div>
@@ .. @@
 };