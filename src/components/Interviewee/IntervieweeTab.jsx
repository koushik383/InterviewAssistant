import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Modal } from 'antd';
import ResumeUpload from './ResumeUpload';
import MissingFieldsForm from './MissingFieldsForm';
import QualificationScreen from './QualificationScreen';
import InterviewChat from './InterviewChat';
import InterviewComplete from './InterviewComplete';
import { resetInterview } from '../../store/slices/interviewSlice';
import { completeCandidate } from '../../store/slices/candidateSlice';

const IntervieweeTab = () => {
  const dispatch = useDispatch();
  const interview = useSelector((state) => state.interview);
  const candidates = useSelector((state) => state.candidates);
  const [stage, setStage] = useState('resume'); // resume, missing-fields, qualification, interview, complete
  const [resumeData, setResumeData] = useState(null);
  const [interviewResult, setInterviewResult] = useState(null);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  // Check for unfinished sessions on mount
  useEffect(() => {
    const currentCandidate = candidates.candidates.find(
      (c) => c.id === candidates.currentCandidateId && c.status === 'in-progress'
    );

    if (currentCandidate && interview.isInterviewStarted && !interview.isInterviewCompleted) {
      setShowWelcomeBack(true);
      setResumeData(currentCandidate);
      setStage('interview');
    }
  }, [candidates.candidates, candidates.currentCandidateId, interview.isInterviewCompleted, interview.isInterviewStarted]);

  const handleResumeData = (data) => {
    setResumeData(data);

    // Always require manual name entry for validation, even if name was extracted
    // Only skip missing fields if email and phone are present
    if (data.email && data.phone) {
      setStage('missing-fields');
    } else {
      setStage('missing-fields');
    }
  };

  const handleMissingFieldsComplete = (completeData) => {
    setResumeData(completeData);
    setStage('qualification');
    dispatch(
      completeCandidate({
        id: candidates.currentCandidateId,
        name: completeData.name,
        email: completeData.email,
        phone: completeData.phone,
      })
    );
  };

  const handleProceedToInterview = () => {
    setStage('interview');
  };

  const handleInterviewComplete = (result) => {
    const completedAt = new Date().toISOString();
    setInterviewResult({ ...result, completedAt });
    setStage('complete');
    dispatch(
      completeCandidate({
        id: candidates.currentCandidateId,
        score: result.score,
        summary: result.summary,
        completedAt,
        // Persist last interview details for dashboard
        answers: [...(interview.answers || [])],
        scores: [...(interview.scores || [])],
        questions: [...(interview.questions || [])],
      })
    );
  };

  const handleNewInterview = () => {
    setStage('resume');
    setResumeData(null);
    setInterviewResult(null);
    dispatch(resetInterview());
  };

  return (
    <div>
      {stage === 'resume' && <ResumeUpload onResumeData={handleResumeData} />}
      {stage === 'missing-fields' && (
        <MissingFieldsForm resumeData={resumeData} onComplete={handleMissingFieldsComplete} />
      )}
      {stage === 'qualification' && (
        <QualificationScreen 
          candidateName={resumeData?.name} 
          onProceedToInterview={handleProceedToInterview} 
        />
      )}
      {stage === 'interview' && (
        <InterviewChat candidateProfile={resumeData} onInterviewComplete={handleInterviewComplete} />
      )}
      {stage === 'complete' && (
        <InterviewComplete
          score={interviewResult?.score}
          summary={interviewResult?.summary}
          candidateName={resumeData?.name}
          onNewInterview={handleNewInterview}
        />
      )}

      <Modal
        title="Welcome Back!"
        open={showWelcomeBack}
        onOk={() => setShowWelcomeBack(false)}
        onCancel={() => setShowWelcomeBack(false)}
        okText="Continue Interview"
      >
        <p>We found your unfinished interview. Click "Continue Interview" to resume where you left off.</p>
      </Modal>
    </div>
  );
};

export default IntervieweeTab;