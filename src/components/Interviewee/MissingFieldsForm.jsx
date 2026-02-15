import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import './MissingFieldsForm.css';

const MissingFieldsForm = ({ resumeData, onComplete }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const missingFields = [];
  // Always require name entry for validation, even if extracted
  missingFields.push('name');
  if (!resumeData.email) missingFields.push('email');
  if (!resumeData.phone) missingFields.push('phone');

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const completeData = {
        ...resumeData,
        ...values,
      };
      onComplete(completeData);
      message.success('Profile completed! Starting interview...');
    } catch (error) {
      message.error('Error completing profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="missing-fields-container">
      <Card className="missing-fields-card">
        <h2>Complete Your Profile</h2>
        <p>We need the following information to proceed. Please enter your name exactly as it appears in your resume:</p>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            ...resumeData,
            name: undefined, // Don't pre-fill name to force manual entry for validation
          }}
        >
          {missingFields.includes('name') && (
            <Form.Item
              label="Full Name"
              name="name"
              validateTrigger={['onBlur', 'onChange']}
              rules={[
                { required: true, message: 'Please enter your full name' },
                {
                  validator: (_, value) => {
                    console.log('Validating name:', { extracted: resumeData.name, entered: value });
                    if (resumeData.name && value) {
                      // Normalize both names for comparison (trim whitespace, lowercase)
                      const extractedName = resumeData.name.trim().toLowerCase();
                      const enteredName = value.trim().toLowerCase();

                      console.log('Normalized names:', { extracted: extractedName, entered: enteredName });

                      if (extractedName !== enteredName) {
                        return Promise.reject(new Error(`Name must match the one extracted from your resume: "${resumeData.name}"`));
                      }
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input placeholder={resumeData.name || "John Doe"} />
            </Form.Item>
          )}

          {missingFields.includes('email') && (
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input placeholder="john@example.com" />
            </Form.Item>
          )}

          {missingFields.includes('phone') && (
            <Form.Item
              label="Phone Number"
              name="phone"
              rules={[{ required: true, message: 'Please enter your phone number' }]}
            >
              <Input placeholder="+1 (555) 123-4567" />
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Start Interview
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default MissingFieldsForm;
