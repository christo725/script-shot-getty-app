import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

// TypeScript interfaces for new state structure
interface Person {
  name: string;
  searchTerm: string;
}

interface GettyMedia {
  id: string;
  title: string;
  thumbnailUrl: string;
  previewUrl: string;
  compUrl: string;
  dateCreated: string;
}

interface PersonGettyResults {
  person: Person;
  videos: GettyMedia[];
  photos: GettyMedia[];
}

interface ModalState {
  isOpen: boolean;
  mediaUrl: string;
  mediaTitle: string;
  mediaType: 'video' | 'photo';
  mediaId: string;
}

interface SelectedItem {
  personIndex: number;
  personName: string;
  mediaId: string;
  mediaType: 'video' | 'photo';
  compUrl: string;
  fileName: string;
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');

function App() {
  // Core state management
  const [script, setScript] = useState('');
  const [shotlist, setShotlist] = useState<Person[]>([]);
  const [gettyResults, setGettyResults] = useState<PersonGettyResults[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [exportText, setExportText] = useState('');
  
  // Modal state
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    mediaUrl: '',
    mediaTitle: '',
    mediaType: 'photo',
    mediaId: ''
  });
  
  // Selection state
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Collection filter state - Penske Media collections (all checked by default)
  const [collections, setCollections] = useState({
    billboard: true,        // blb
    wwd: true,             // wom
    rollingStone: true,    // rol
    hollywoodReporter: true, // tho
    variety: true          // vrt
  });
  
  // PMCARC phrase filter (checked by default)
  const [usePMCARC, setUsePMCARC] = useState(true);
  
  // Penske Media collection codes
  const COLLECTION_CODES = {
    billboard: 'blb',
    wwd: 'wom',
    rollingStone: 'rol',
    hollywoodReporter: 'tho',
    variety: 'vrt'
  };

  // Clear export text when selections change
  useEffect(() => {
    setExportText('');
  }, [selectedItems]);

  // Initialize Getty API access token
  useEffect(() => {
    const getAccessToken = async () => {
      try {
        const authData = {
          grant_type: 'client_credentials',
          client_id: process.env.REACT_APP_GETTY_API_KEY || '',
          client_secret: process.env.REACT_APP_GETTY_API_SECRET || ''
        };

        const response = await fetch('https://api.gettyimages.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Api-Key': process.env.REACT_APP_GETTY_API_KEY || ''
          },
          body: new URLSearchParams(authData).toString()
        });

        if (!response.ok) {
          throw new Error(`Failed to get access token: ${response.status}`);
        }

        const tokenData = await response.json();
        if (tokenData.access_token) {
          setAccessToken(tokenData.access_token);
        } else {
          throw new Error('No access token in response');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Getty API';
        console.error('Getty API initialization error:', error);
        setError(errorMessage);
      }
    };

    getAccessToken();
  }, []);

  // Step 1: Submit script
  const handleScriptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (script.trim()) {
      setCurrentStep(2);
      setError('');
    }
  };

  // Step 2: Generate shotlist with Gemini
  const handleGenerateShotlist = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const prompt = `Extract all people explicitly mentioned in this script. For each person, provide their name and a Getty Images-compatible search term that includes relevant context (event, date, location if mentioned in the script).

Return ONLY a valid JSON array with this exact format:
[{"name": "Person Name", "searchTerm": "Person Name context"}]

Examples:
[{"name": "Taylor Swift", "searchTerm": "Taylor Swift 2025 Grammy Awards"}]
[{"name": "Joe Biden", "searchTerm": "Joe Biden White House 2024"}]

Script:
${script}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();
      
      // Clean up response - remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const people: Person[] = JSON.parse(text);
      
      if (!Array.isArray(people) || people.length === 0) {
        throw new Error('No people found in script');
      }
      
      setShotlist(people);
      setCurrentStep(3);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate shotlist';
      setError(errorMessage);
      console.error('Shotlist generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Search Getty for each person
  const handleSearchGetty = async () => {
    if (!accessToken) {
      setError('Getty API not initialized');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const results: PersonGettyResults[] = [];
      
      for (const person of shotlist) {
        // Use only the person's name for Getty search (not the full search term)
        const videos = await searchGettyVideos(person.name);
        const photos = await searchGettyPhotos(person.name);
        
        results.push({
          person,
          videos,
          photos
        });
        
        // Rate limiting
        await delay(1000);
      }
      
      setGettyResults(results);
      setCurrentStep(4);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search Getty Images';
      setError(errorMessage);
      console.error('Getty search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: Search Getty videos
  const searchGettyVideos = async (searchTerm: string): Promise<GettyMedia[]> => {
    // Build phrase - include PMCARC if enabled
    let phrase = searchTerm;
    if (usePMCARC) {
      phrase = `${searchTerm} PMCARC`;
    }
    
    const params = new URLSearchParams({
      phrase: phrase,
      page: '1',
      page_size: '30',  // Fetch more results to ensure we get quality matches
      fields: 'id,title,thumb,preview,comp,date_created',
      sort_order: 'most_popular'  // Use most_popular for editorial content (celebrities)
    });
    
    // Add collection codes if any are selected
    const collectionCodes = getActiveCollectionCodes();
    if (collectionCodes) {
      params.append('collection_codes', collectionCodes);
    }

    const response = await fetch(`/api/getty-videos?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Getty video search failed: ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`Getty Video Search for "${searchTerm}": Found ${data.videos?.length || 0} results`);
    
    if (!data.videos || data.videos.length === 0) {
      console.warn(`No videos found for search term: "${searchTerm}"`);
      return [];
    }
    
    // Return top 5 most relevant videos from the results
    return (data.videos || []).slice(0, 5).map((video: any) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.display_sizes?.find((size: any) => size.name === 'thumb')?.uri || '',
      previewUrl: video.display_sizes?.find((size: any) => size.name === 'preview')?.uri || '',
      compUrl: video.display_sizes?.find((size: any) => size.name === 'comp')?.uri || 
               video.display_sizes?.find((size: any) => size.name === 'preview')?.uri || '',
      dateCreated: video.date_created
    }));
  };

  // Helper: Search Getty photos
  const searchGettyPhotos = async (searchTerm: string): Promise<GettyMedia[]> => {
    // Build phrase - include PMCARC if enabled
    let phrase = searchTerm;
    if (usePMCARC) {
      phrase = `${searchTerm} PMCARC`;
    }
    
    const params = new URLSearchParams({
      phrase: phrase,
      page: '1',
      page_size: '30',  // Fetch more results to ensure we get quality matches
      fields: 'id,title,thumb,preview,comp,date_created',
      sort_order: 'most_popular'  // Use most_popular for editorial content (celebrities)
    });
    
    // Add collection codes if any are selected
    const collectionCodes = getActiveCollectionCodes();
    if (collectionCodes) {
      params.append('collection_codes', collectionCodes);
    }

    const response = await fetch(`/api/getty-photos?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Getty photo search failed: ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`Getty Photo Search for "${searchTerm}": Found ${data.images?.length || 0} results`);
    
    if (!data.images || data.images.length === 0) {
      console.warn(`No photos found for search term: "${searchTerm}"`);
      return [];
    }
    
    // Return top 5 most relevant photos from the results
    return (data.images || []).slice(0, 5).map((photo: any) => ({
      id: photo.id,
      title: photo.title,
      thumbnailUrl: photo.display_sizes?.find((size: any) => size.name === 'thumb')?.uri || '',
      previewUrl: photo.display_sizes?.find((size: any) => size.name === 'preview')?.uri || '',
      compUrl: photo.display_sizes?.find((size: any) => size.name === 'comp')?.uri || 
               photo.display_sizes?.find((size: any) => size.name === 'preview')?.uri || '',
      dateCreated: photo.date_created
    }));
  };

  // Step 5: Compile CSV export with metadata (only selected items)
  const handleCompileExport = () => {
    if (selectedItems.length === 0) {
      setError('No items selected. Please select videos or photos to export.');
      return;
    }

    // CSV Header
    let csvText = 'Person Name,Getty File ID,Media Type,Title,Date Created,Download URL\n';

    // Add each selected item as a CSV row
    selectedItems.forEach(item => {
      // Find the corresponding media item in gettyResults
      const result = gettyResults[item.personIndex];
      if (!result) return;

      let media: GettyMedia | undefined;
      if (item.mediaType === 'video') {
        media = result.videos.find(v => v.id === item.mediaId);
      } else {
        media = result.photos.find(p => p.id === item.mediaId);
      }

      if (media) {
        const title = `"${media.title.replace(/"/g, '""')}"`;  // Escape quotes in title
        const date = new Date(media.dateCreated).toLocaleDateString();
        const downloadUrl = media.compUrl;
        csvText += `${item.personName},${media.id},${item.mediaType},${title},${date},${downloadUrl}\n`;
      }
    });

    setExportText(csvText);
    setCurrentStep(5);
  };

  // Copy to clipboard
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      alert('Copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Download as CSV file
  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'getty-metadata.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Step 5: Clear and start over
  const handleClear = () => {
    setScript('');
    setShotlist([]);
    setGettyResults([]);
    setExportText('');
    setCurrentStep(1);
    setError('');
    setSelectedItems([]);
  };

  // Helper: delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper: Get active collection codes as comma-separated string
  const getActiveCollectionCodes = (): string | null => {
    const activeCodes = Object.entries(collections)
      .filter(([_, isActive]) => isActive)
      .map(([key, _]) => COLLECTION_CODES[key as keyof typeof COLLECTION_CODES]);
    
    return activeCodes.length > 0 ? activeCodes.join(',') : null;
  };
  
  // Helper: Toggle individual collection
  const toggleCollection = (collectionKey: keyof typeof collections) => {
    setCollections(prev => ({
      ...prev,
      [collectionKey]: !prev[collectionKey]
    }));
  };
  
  // Helper: Select/Deselect all collections
  const toggleAllCollections = (checked: boolean) => {
    setCollections({
      billboard: checked,
      wwd: checked,
      rollingStone: checked,
      hollywoodReporter: checked,
      variety: checked
    });
  };

  // Modal handlers
  const openModal = (url: string, title: string, type: 'video' | 'photo', id: string) => {
    setModal({
      isOpen: true,
      mediaUrl: url,
      mediaTitle: title,
      mediaType: type,
      mediaId: id
    });
  };

  const closeModal = () => {
    setModal({
      isOpen: false,
      mediaUrl: '',
      mediaTitle: '',
      mediaType: 'photo',
      mediaId: ''
    });
  };

  // Selection handlers
  const toggleSelection = (personIndex: number, personName: string, media: GettyMedia, type: 'video' | 'photo') => {
    setSelectedItems(prev => {
      const existingIndex = prev.findIndex(
        item => item.personIndex === personIndex && item.mediaId === media.id
      );
      
      if (existingIndex >= 0) {
        // Remove from selection
        return prev.filter((_, index) => index !== existingIndex);
      } else {
        // Add to selection
        return [...prev, {
          personIndex,
          personName,
          mediaId: media.id,
          mediaType: type,
          compUrl: media.compUrl,
          fileName: `${media.id}.${type === 'video' ? 'mp4' : 'jpg'}`
        }];
      }
    });
  };

  const isSelected = (personIndex: number, mediaId: string): boolean => {
    return selectedItems.some(
      item => item.personIndex === personIndex && item.mediaId === mediaId
    );
  };

  const selectAllVideos = (personIndex: number, personName: string, videos: GettyMedia[]) => {
    const videoSelections = videos.map(video => ({
      personIndex,
      personName,
      mediaId: video.id,
      mediaType: 'video' as 'video' | 'photo',
      compUrl: video.compUrl,
      fileName: `${video.id}.mp4`
    }));
    
    setSelectedItems(prev => {
      // Remove existing videos for this person
      const filtered = prev.filter(
        item => !(item.personIndex === personIndex && item.mediaType === 'video')
      );
      // Add all videos
      return [...filtered, ...videoSelections];
    });
  };

  const selectAllPhotos = (personIndex: number, personName: string, photos: GettyMedia[]) => {
    const photoSelections = photos.map(photo => ({
      personIndex,
      personName,
      mediaId: photo.id,
      mediaType: 'photo' as 'video' | 'photo',
      compUrl: photo.compUrl,
      fileName: `${photo.id}.jpg`
    }));
    
    setSelectedItems(prev => {
      // Remove existing photos for this person
      const filtered = prev.filter(
        item => !(item.personIndex === personIndex && item.mediaType === 'photo')
      );
      // Add all photos
      return [...filtered, ...photoSelections];
    });
  };

  const deselectAllVideos = (personIndex: number) => {
    setSelectedItems(prev => 
      prev.filter(item => !(item.personIndex === personIndex && item.mediaType === 'video'))
    );
  };

  const deselectAllPhotos = (personIndex: number) => {
    setSelectedItems(prev => 
      prev.filter(item => !(item.personIndex === personIndex && item.mediaType === 'photo'))
    );
  };

  // Global selection functions
  const selectAllVideosGlobal = () => {
    const allVideoSelections: SelectedItem[] = [];
    gettyResults.forEach((result, index) => {
      result.videos.forEach(video => {
        allVideoSelections.push({
          personIndex: index,
          personName: result.person.name,
          mediaId: video.id,
          mediaType: 'video',
          compUrl: video.compUrl,
          fileName: `${video.id}.mp4`
        });
      });
    });
    
    setSelectedItems(prev => {
      // Remove all existing video selections
      const filtered = prev.filter(item => item.mediaType !== 'video');
      // Add all videos
      return [...filtered, ...allVideoSelections];
    });
  };

  const deselectAllVideosGlobal = () => {
    setSelectedItems(prev => prev.filter(item => item.mediaType !== 'video'));
  };

  const selectAllPhotosGlobal = () => {
    const allPhotoSelections: SelectedItem[] = [];
    gettyResults.forEach((result, index) => {
      result.photos.forEach(photo => {
        allPhotoSelections.push({
          personIndex: index,
          personName: result.person.name,
          mediaId: photo.id,
          mediaType: 'photo',
          compUrl: photo.compUrl,
          fileName: `${photo.id}.jpg`
        });
      });
    });
    
    setSelectedItems(prev => {
      // Remove all existing photo selections
      const filtered = prev.filter(item => item.mediaType !== 'photo');
      // Add all photos
      return [...filtered, ...allPhotoSelections];
    });
  };

  const deselectAllPhotosGlobal = () => {
    setSelectedItems(prev => prev.filter(item => item.mediaType !== 'photo'));
  };

  // Download selected items as zip
  const downloadSelectedAsZip = async () => {
    if (selectedItems.length === 0) {
      alert('No items selected');
      return;
    }

    setIsDownloading(true);
    setError('');

    try {
      const zip = new JSZip();
      
      // Group by person
      const groupedByPerson: { [key: string]: SelectedItem[] } = {};
      selectedItems.forEach(item => {
        if (!groupedByPerson[item.personName]) {
          groupedByPerson[item.personName] = [];
        }
        groupedByPerson[item.personName].push(item);
      });

      // Fetch and add each file to zip
      for (const [personName, items] of Object.entries(groupedByPerson)) {
        for (const item of items) {
          try {
            const response = await fetch(item.compUrl);
            const blob = await response.blob();
            const folderPath = `${personName}/${item.mediaType}s`;
            zip.file(`${folderPath}/${item.fileName}`, blob);
          } catch (err) {
            console.error(`Failed to download ${item.fileName}:`, err);
          }
        }
      }

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'getty-images.zip');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create zip file';
      setError(errorMessage);
      console.error('Zip creation error:', err);
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>CH1 Shotlist Generator & Getty Images Search</h1>
        
        {error && <div className="error-message">{error}</div>}
        
        {/* Step 1: Script Input */}
        <div className="step-container">
          <h2>Step 1: Paste Your Script</h2>
          <form onSubmit={handleScriptSubmit} className="form-container">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste your script text here..."
              className="script-input"
              rows={10}
              disabled={currentStep > 1}
            />
            {currentStep === 1 && (
              <button
                type="submit"
                className="submit-button"
                disabled={!script.trim()}
              >
                Submit Script
              </button>
            )}
          </form>
        </div>

        {/* Step 2: Generate Shotlist */}
        {currentStep >= 2 && (
          <div className="step-container">
            <h2>Step 2: Generate Shotlist</h2>
            {shotlist.length === 0 ? (
              <button
                onClick={handleGenerateShotlist}
                className="submit-button"
                disabled={isLoading}
              >
                {isLoading ? 'Generating...' : 'Generate Shotlist'}
              </button>
            ) : (
              <div className="shotlist-container">
                <h3>People in Script:</h3>
                <ul className="shotlist">
                  {shotlist.map((person, index) => (
                    <li key={index} className="shotlist-item">
                      <strong>{person.name}</strong>
                      <span className="search-term"> - {person.searchTerm}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Search Getty */}
        {currentStep >= 3 && shotlist.length > 0 && (
          <div className="step-container">
            <h2>Step 3: Search Getty Images</h2>
            {gettyResults.length === 0 ? (
              <div className="search-controls">
                <div className="collection-filters">
                  <h3 className="filter-title">Filter by Penske Media Collections</h3>
                  
                  <div className="collection-controls">
                    <button
                      onClick={() => toggleAllCollections(true)}
                      className="toggle-all-button"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => toggleAllCollections(false)}
                      className="toggle-all-button"
                    >
                      Deselect All
                    </button>
                  </div>
                  
                  <div className="collection-checkboxes">
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={collections.billboard}
                        onChange={() => toggleCollection('billboard')}
                      />
                      <span>Billboard (blb)</span>
                    </label>
                    
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={collections.wwd}
                        onChange={() => toggleCollection('wwd')}
                      />
                      <span>WWD (wom)</span>
                    </label>
                    
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={collections.rollingStone}
                        onChange={() => toggleCollection('rollingStone')}
                      />
                      <span>Rolling Stone (rol)</span>
                    </label>
                    
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={collections.hollywoodReporter}
                        onChange={() => toggleCollection('hollywoodReporter')}
                      />
                      <span>Hollywood Reporter (tho)</span>
                    </label>
                    
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={collections.variety}
                        onChange={() => toggleCollection('variety')}
                      />
                      <span>Variety (vrt)</span>
                    </label>
                  </div>
                  
                  <div className="active-filters-info">
                    {getActiveCollectionCodes() ? (
                      <span>Active collections: {getActiveCollectionCodes()}</span>
                    ) : (
                      <span>No collections selected - searching all collections</span>
                    )}
                  </div>
                  
                  <div className="pmcarc-filter">
                    <label className="collection-checkbox-label">
                      <input
                        type="checkbox"
                        checked={usePMCARC}
                        onChange={(e) => setUsePMCARC(e.target.checked)}
                      />
                      <span>Include PMCARC phrase filter</span>
                    </label>
                  </div>
                </div>
                
                <button
                  onClick={handleSearchGetty}
                  className="submit-button"
                  disabled={isLoading || !accessToken}
                >
                  {isLoading ? 'Searching...' : 'Search Getty Images'}
                </button>
              </div>
            ) : (
              <div className="getty-results-container">
                {gettyResults.map((result, index) => (
                  <div key={index} className="person-results">
                    <div className="person-header">
                      <h3 className="person-name">{result.person.name}</h3>
                    </div>
                    
                    <div className="section-header">
                      <h4>Videos ({result.videos.length})</h4>
                      <div className="selection-buttons">
                        <button
                          onClick={() => selectAllVideos(index, result.person.name, result.videos)}
                          className="select-all-button"
                        >
                          Select All Videos
                        </button>
                        <button
                          onClick={() => deselectAllVideos(index)}
                          className="deselect-all-button"
                        >
                          Deselect All Videos
                        </button>
                      </div>
                    </div>
                    <div className="media-grid">
                      {result.videos.map((video) => (
                        <div 
                          key={video.id} 
                          className={`media-item ${isSelected(index, video.id) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="media-checkbox"
                            checked={isSelected(index, video.id)}
                            onChange={() => toggleSelection(index, result.person.name, video, 'video')}
                          />
                          <div 
                            className="media-thumbnail"
                            onClick={() => openModal(video.compUrl, video.title, 'video', video.id)}
                          >
                            <img src={video.thumbnailUrl} alt={video.title} />
                          </div>
                          <div className="media-info">
                            <p className="media-id">ID: {video.id}</p>
                            <p className="media-title">{video.title}</p>
                            <p className="media-date">
                              {new Date(video.dateCreated).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="section-header">
                      <h4>Photos ({result.photos.length})</h4>
                      <div className="selection-buttons">
                        <button
                          onClick={() => selectAllPhotos(index, result.person.name, result.photos)}
                          className="select-all-button"
                        >
                          Select All Photos
                        </button>
                        <button
                          onClick={() => deselectAllPhotos(index)}
                          className="deselect-all-button"
                        >
                          Deselect All Photos
                        </button>
                      </div>
                    </div>
                    <div className="media-grid">
                      {result.photos.map((photo) => (
                        <div 
                          key={photo.id} 
                          className={`media-item ${isSelected(index, photo.id) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="media-checkbox"
                            checked={isSelected(index, photo.id)}
                            onChange={() => toggleSelection(index, result.person.name, photo, 'photo')}
                          />
                          <div 
                            className="media-thumbnail"
                            onClick={() => openModal(photo.compUrl, photo.title, 'photo', photo.id)}
                          >
                            <img src={photo.thumbnailUrl} alt={photo.title} />
                          </div>
                          <div className="media-info">
                            <p className="media-id">ID: {photo.id}</p>
                            <p className="media-title">{photo.title}</p>
                            <p className="media-date">
                              {new Date(photo.dateCreated).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Download Selected Items */}
        {currentStep >= 4 && gettyResults.length > 0 && (
          <div className="step-container">
            <h2>Step 4: Download Selected Items</h2>
            
            {/* Global Selection Controls */}
            <div className="global-selection-controls">
              <div className="selection-row">
                <h3>Videos ({selectedItems.filter(item => item.mediaType === 'video').length} selected)</h3>
                <div className="selection-buttons">
                  <button
                    onClick={selectAllVideosGlobal}
                    className="select-all-button"
                  >
                    Select All Videos
                  </button>
                  <button
                    onClick={deselectAllVideosGlobal}
                    className="deselect-all-button"
                  >
                    Deselect All Videos
                  </button>
                </div>
              </div>
              
              <div className="selection-row">
                <h3>Photos ({selectedItems.filter(item => item.mediaType === 'photo').length} selected)</h3>
                <div className="selection-buttons">
                  <button
                    onClick={selectAllPhotosGlobal}
                    className="select-all-button"
                  >
                    Select All Photos
                  </button>
                  <button
                    onClick={deselectAllPhotosGlobal}
                    className="deselect-all-button"
                  >
                    Deselect All Photos
                  </button>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="download-section">
              <p className="total-selected">Total Selected: {selectedItems.length} items</p>
              <button
                onClick={downloadSelectedAsZip}
                className="download-selected-button"
                disabled={isDownloading || selectedItems.length === 0}
              >
                {isDownloading 
                  ? 'Downloading...' 
                  : `Download All Selected (${selectedItems.length})`}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Export CSV Metadata */}
        {currentStep >= 4 && gettyResults.length > 0 && (
          <div className="step-container">
            <h2>Step 5: Export CSV Metadata (Selected Items Only)</h2>
            <div className="total-selected" style={{ marginBottom: '20px' }}>
              {selectedItems.length} items selected for CSV export
            </div>
            {!exportText ? (
              <button
                onClick={handleCompileExport}
                className="submit-button"
                disabled={selectedItems.length === 0}
              >
                Generate CSV from Selected Items
              </button>
            ) : (
              <div className="export-container">
                <div style={{ marginBottom: '10px', color: '#61dafb' }}>
                  CSV generated with {selectedItems.length} selected items
                </div>
                <textarea
                  value={exportText}
                  readOnly
                  className="export-text"
                  rows={10}
                />
                <div className="export-buttons">
                  <button
                    onClick={handleCompileExport}
                    className="submit-button"
                    style={{ backgroundColor: '#e74c3c' }}
                  >
                    Regenerate CSV
                  </button>
                  <button onClick={handleCopyToClipboard} className="submit-button">
                    Copy to Clipboard
                  </button>
                  <button onClick={handleDownload} className="submit-button">
                    Download CSV File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Clear Results */}
        {currentStep >= 5 && (
          <div className="step-container">
            <h2>Step 6: Start Over</h2>
            <button onClick={handleClear} className="clear-button">
              Clear All Results
            </button>
          </div>
        )}

        {/* Modal for Image/Video Preview */}
        {modal.isOpen && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeModal}>×</button>
              <div className="modal-media">
                {modal.mediaType === 'video' ? (
                  <video 
                    src={modal.mediaUrl} 
                    controls 
                    autoPlay
                    style={{ maxWidth: '100%', maxHeight: '70vh' }}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <img src={modal.mediaUrl} alt={modal.mediaTitle} />
                )}
              </div>
              <div className="modal-info">
                <p className="modal-title">{modal.mediaTitle}</p>
                <p className="modal-id">ID: {modal.mediaId}</p>
              </div>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
